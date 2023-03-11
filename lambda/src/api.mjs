import { readFileSync } from 'fs'
import {
    EC2Client,
    DescribeInstancesCommand,
    TerminateInstancesCommand,
    StopInstancesCommand,
    waitUntilInstanceExists,
    DescribeVolumesCommand,
    CreateVolumeCommand,
    CreateTagsCommand,
    waitUntilVolumeAvailable,
    DescribeVpcsCommand,
    DescribeSecurityGroupsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    ModifyInstanceAttributeCommand,
    StartInstancesCommand,
    waitUntilInstanceRunning,
    DescribeSubnetsCommand,
    RunInstancesCommand,
    CreateSnapshotCommand,
    waitUntilSnapshotCompleted, CopySnapshotCommand, DeleteVolumeCommand
} from "@aws-sdk/client-ec2";
import {AssumeRoleCommand, STSClient} from "@aws-sdk/client-sts";
import {GetParameterCommand, PutParameterCommand, SSMClient} from "@aws-sdk/client-ssm";

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function findInstance(region, user) {
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});

    const list = await EC2.send(new DescribeInstancesCommand({
        Filters: [
            {Name: 'tag:Name', Values: ['jetbrains']},
            {Name: 'tag:Owner', Values: [user]},
            {Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped', 'shutting-down']}
        ]
    }))

    console.log(JSON.stringify(list))
    if (list.Reservations.length === 0) {
        return null;
    }
    if (list.Reservations[0].Instances.length === 0) {
        return null
    }

    return list.Reservations[0].Instances[0]
}

export async function terminateInstance(region, user) {
    const instance = await findInstance(region, user)
    if (!instance) {
        return {status: true}
    }
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    await EC2.send(new TerminateInstancesCommand({
        InstanceIds: [instance.InstanceId]
    }))

    return {status: true}
}

export async function hibernateInstance(region, user) {
    const instance = await findInstance(region, user)
    console.log(JSON.stringify(instance))
    if (!instance) {
        return {status: true}
    }
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    await EC2.send(new StopInstancesCommand({
        InstanceIds: [instance.InstanceId],
        Hibernate: true
    }))
    await waitUntilInstanceExists({client: EC2, maxWaitTime: 120}, {InstanceIds: [instance.InstanceId]})

    return {status: true}
}

async function findVolume(region, user, snapshot) {
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    const filterTags = [
        {Name: 'tag:Name', Values: ['jetbrains']},
        {Name: 'tag:Owner', Values: [user]}
    ]
    const tags = [
        {Key: 'Name', Value: 'jetbrains'},
        {Key: 'Owner', Value: user},
    ]
    const volumes = (await EC2.send(new DescribeVolumesCommand({
        Filters: filterTags
    }))).Volumes
    if (volumes.length === 0) {
        const volume = await EC2.send(new CreateVolumeCommand({
            VolumeType: 'gp3',
            Size: 30,
            AvailabilityZone: `${region}a`,
            SnapshotId: snapshot ? snapshot : null
        }))

        await EC2.send(new CreateTagsCommand({
            Resources: [volume.VolumeId],
            Tags: tags
        }))

        await waitUntilVolumeAvailable({client: EC2, maxWaitTime: 120}, {VolumeIds: [volume.VolumeId]})
        return volume
    }
    return volumes[0]
}

async function findVpc(region) {
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    return (await EC2.send(new DescribeVpcsCommand({
        Filters: [
            {Name: 'is-default', Values: ['true']}
        ]
    }))).Vpcs[0].VpcId
}

export async function startInstance(region, user, userName, ip, instanceType) {
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    const SSM = new SSMClient({region: region})

    const filterTags = [
        {Name: 'tag:Name', Values: ['jetbrains']},
        {Name: 'tag:Owner', Values: [user]}
    ]
    const tags = [
        {Key: 'Name', Value: 'jetbrains'},
        {Key: 'Owner', Value: user},
    ]

    const ami = JSON.parse((await SSM.send(new GetParameterCommand({
        Name: '/aws/service/ecs/optimized-ami/amazon-linux-2/recommended',
        WithDecryption: true
    }))).Parameter.Value).image_id

    const securityGroups = (await EC2.send(new DescribeSecurityGroupsCommand({
        Filters: filterTags
    }))).SecurityGroups

    let securityGroup
    if (securityGroups.length === 0) {
        const vpc = await findVpc(region)

        securityGroup = (await EC2.send(new CreateSecurityGroupCommand({
            GroupName: 'jetbrains-' + user.replace(/[^a-z\d]/g, ''),
            Description: 'jetbrains ' + user,
            VpcId: vpc
        }))).GroupId

        await EC2.send(new CreateTagsCommand({
            Resources: [securityGroup],
            Tags: tags
        }))

    } else {
        securityGroup = securityGroups[0].GroupId
    }

    for (const port of [22]) {
        try {
            await EC2.send(new AuthorizeSecurityGroupIngressCommand({
                GroupId: securityGroup,
                FromPort: port,
                ToPort: port,
                CidrIp: `${ip}/24`,
                IpProtocol: 'tcp'
            }))
        } catch (e) {
            console.log(e)
        }
    }

    const sts = new STSClient({apiVersion: '2011-06-15'});
    const aliasCredentials = await sts.send(new AssumeRoleCommand({
        RoleArn: process.env.ALIAS_ROLE_ARN,
        RoleSessionName: user.replace('@', ''),
        DurationSeconds: 15 * 60
    }))

    /*await EC2.requestSpotFleet({
        SpotFleetRequestConfig: {
            IamFleetRole: "arn:aws:iam::146678277531:role/aws-ec2-spot-fleet-tagging-role",
            LaunchSpecifications: [
                {
                    ImageId: ami,
                    InstanceType: "m5.large",
                    SecurityGroups: [{GroupId: securityGroup}],
                    UserData: Buffer.from(userData, 'utf8').toString('base64'),
                    Placement: {
                        AvailabilityZone: volume.AvailabilityZone
                    },
                    IamInstanceProfile: {
                        Name: 'ec2_instance_role_jetbrains'
                    },
                }
            ],
            TargetCapacity: 1,
            Type: 'request'
        }
    }).promise();*/

    const existingInstance = await findInstance(region, user)

    if (existingInstance) {
        if (['stopped', 'stopping'].indexOf(existingInstance.State.Name) > -1) {
            await EC2.send(new ModifyInstanceAttributeCommand({
                InstanceId: existingInstance.InstanceId,
                UserData: {
                    Value: await createUserData(region, user, userName, aliasCredentials)
                },
            }))
            await EC2.send(new StartInstancesCommand({
                InstanceIds: [existingInstance.InstanceId]
            }))
            await waitUntilInstanceRunning({client: EC2, maxWaitTime: 120 }, {
                InstanceIds: [existingInstance.InstanceId]
            })
        }
    } else if (!(await findInstance(region, user))) {
        const subnet = (await EC2.send(new DescribeSubnetsCommand({
            Filters: [
                {Name: 'availability-zone', Values: [`${region}a`]},
                {Name: 'vpc-id', Values: [await findVpc(region)]}
            ]
        }))).Subnets[0].SubnetId

        const instance = await EC2.send(new RunInstancesCommand({
            UserData: await createUserData(region, user, userName, aliasCredentials),
            InstanceType: instanceType,
            EbsOptimized: true,
            IamInstanceProfile: {Name: 'ec2_instance_role_jetbrains'},
            BlockDeviceMappings: [
                {
                    "DeviceName": "/dev/xvda",
                    "Ebs": {
                        "Encrypted": true,
                    }
                }
            ],
            SecurityGroupIds: [securityGroup],
            SubnetId: subnet,
            ImageId: ami,
            HibernationOptions: {Configured: false},
            MinCount: 1,
            MaxCount: 1
        }))

        await EC2.send(new CreateTagsCommand({
            Resources: [instance.Instances[0].InstanceId],
            Tags: tags
        }))

        await waitUntilInstanceExists({client: EC2, maxWaitTime: 120}, {InstanceIds: [instance.Instances[0].InstanceId]})
    }

    return {
        status: true
    }
}

export async function migrate(user, fromRegion, targetRegion) {
    const EC2from = new EC2Client({apiVersion: '2016-11-15', region: fromRegion});
    const EC2target = new EC2Client({apiVersion: '2016-11-15', region: targetRegion});

    const fromVolume = await findVolume(fromRegion, user)

    const snapshot = await EC2from.send(new CreateSnapshotCommand({
        Description: 'migrate-to-' + targetRegion,
        VolumeId: fromVolume.VolumeId,
    }))

    await waitUntilSnapshotCompleted({client: EC2from, maxWaitTime: 600}, {SnapshotIds: [snapshot.SnapshotId]})

    const newSnapshot = await EC2target.send(new CopySnapshotCommand({
        SourceRegion: fromRegion,
        DestinationRegion: targetRegion,
        SourceSnapshotId: snapshot.SnapshotId,
        Description: 'migrate-from-' + fromRegion
    }))

    await waitUntilSnapshotCompleted({client: EC2target, maxWaitTime: 600}, {SnapshotIds: [newSnapshot.SnapshotId]})

    await findVolume(targetRegion, user, newSnapshot.SnapshotId)

    await (new SSMClient({region: 'eu-central-1'}))
        .send(new PutParameterCommand({
            Name: '/ec2/region/' + user.replace('@', '-'),
            Value: targetRegion,
            Overwrite: true
        }))

    await EC2from.send(new DeleteVolumeCommand({
        VolumeId: fromVolume.VolumeId
    }))

    return {
        status: true
    }
}

async function createUserData(region, user, userName, aliasCredentials) {
    const SSM = new SSMClient({region: 'eu-central-1'})

    const sshKey = (await SSM.send(new GetParameterCommand({
        Name: '/ec2/key/' + user.replace('@', '-'),
        WithDecryption: true
    }))).Parameter.Value

    let volume = await findVolume(region, user);

    const userData = readFileSync(`${__dirname}/user_data.sh`, 'utf8')
        .replace(/%ebs_id%/g, volume.VolumeId)
        .replace(/%region%/g, region)
        .replace(/%key%/g, sshKey)
        .replace(/%email%/g, user)
        .replace(/%userName%/g, userName)
        .replace(/%awsId%/g, aliasCredentials.Credentials.AccessKeyId)
        .replace(/%awsKey%/g, aliasCredentials.Credentials.SecretAccessKey)
        .replace(/%awsToken%/g, aliasCredentials.Credentials.SessionToken)
        .replace(/%hostedZone%/g, process.env.ALIAS_HOSTED_ZONE)
        .replace(/%domain%/g, `${user.replace(/[@.]/g, '-')}.${process.env.ALIAS_DOMAIN}`)

    return Buffer.from(userData, 'utf8').toString('base64')
}