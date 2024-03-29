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
    waitUntilSnapshotCompleted,
    CopySnapshotCommand,
    DeleteVolumeCommand,
    AttachVolumeCommand,
    waitUntilInstanceStopped,
    RevokeSecurityGroupIngressCommand
} from "@aws-sdk/client-ec2";
import {AssumeRoleCommand, STSClient} from "@aws-sdk/client-sts";
import {GetParameterCommand, ParameterType, PutParameterCommand, SSMClient} from "@aws-sdk/client-ssm";

import path from 'path';
import { fileURLToPath } from 'url';
import {ChangeResourceRecordSetsCommand, Route53Client} from "@aws-sdk/client-route-53";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getUserRegion(user){
    return (await (new SSMClient({region: 'eu-central-1'}))
        .send(new GetParameterCommand({
            Name: '/ec2/region/' + user.replace('@', '-'),
            WithDecryption: true
        }))).Parameter.Value
}

export async function attachEbs(user) {
    const region = await getUserRegion(user)

    const instance = await findInstance(region, user)
    const volume = await findVolume(region, user)
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    await EC2.send(new AttachVolumeCommand({
        InstanceId: instance.InstanceId,
        VolumeId: volume.VolumeId,
        Device: '/dev/xvde'
    }))
}

export async function updateAlias(user) {
    const region = await getUserRegion(user)

    const instance = await findInstance(region, user)

    const sts = new STSClient({apiVersion: '2011-06-15'});
    const aliasCredentials = await sts.send(new AssumeRoleCommand({
        RoleArn: process.env.ALIAS_ROLE_ARN,
        RoleSessionName: user.replace('@', ''),
        DurationSeconds: 15 * 60
    }))

    const route53 = new Route53Client({
        apiVersion: '2013-04-01',
        credentials: {
            accessKeyId: aliasCredentials.Credentials.AccessKeyId,
            secretAccessKey: aliasCredentials.Credentials.SecretAccessKey,
            sessionToken: aliasCredentials.Credentials.SessionToken
        }
    });

    await route53.send(new ChangeResourceRecordSetsCommand({
        HostedZoneId: process.env.ALIAS_HOSTED_ZONE,
        ChangeBatch: {
            Changes: [
                {
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        Name: `${user.replace(/[@.]/g, '-')}.${process.env.ALIAS_DOMAIN}`,
                        Type: 'A',
                        TTL: 15,
                        ResourceRecords: [
                            {Value: instance.PublicIpAddress}
                        ]
                    }
                }
            ]
        }
    }));

    instance.PublicIpAddress
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    await EC2.send(new AttachVolumeCommand({
        InstanceId: instance.InstanceId,
        VolumeId: volume.VolumeId,
        Device: '/dev/xvde'
    }))
}

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

export async function stopInstance(region, user) {
    const instance = await findInstance(region, user)
    console.log(JSON.stringify(instance))
    if (!instance) {
        return {status: true}
    }
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    await EC2.send(new StopInstancesCommand({
        InstanceIds: [instance.InstanceId],
        Hibernate: instance.HibernationOptions.Configured
    }))
    await waitUntilInstanceStopped({client: EC2, maxWaitTime: 120}, {InstanceIds: [instance.InstanceId]})

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

    const tags = [
        {Key: 'Name', Value: 'jetbrains'},
        {Key: 'Owner', Value: user},
    ]

    const ami = (await SSM.send(new GetParameterCommand({
        Name: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2',
        WithDecryption: true
    }))).Parameter.Value

    let securityGroup = await findSecurityGroup(user, region)
    if (securityGroup) {
        securityGroup = securityGroup.GroupId
    } else {
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
    }

    for (const port of [22]) {
        try {
            await EC2.send(new AuthorizeSecurityGroupIngressCommand({
                GroupId: securityGroup,
                FromPort: port,
                ToPort: port,
                CidrIp: `${ip}/32`,
                IpProtocol: 'tcp'
            }))
        } catch (e) {
            console.log(e)
        }
    }

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
        if (instanceType && instanceType !== existingInstance.InstanceType) {
            await EC2.send(new ModifyInstanceAttributeCommand({
                InstanceId: existingInstance.InstanceId,
                InstanceType: {
                    Value: instanceType
                }
            }))
        }
        if (['stopped', 'stopping'].indexOf(existingInstance.State.Name) > -1) {
            await EC2.send(new ModifyInstanceAttributeCommand({
                InstanceId: existingInstance.InstanceId,
                UserData: {
                    Value: await createUserData(user, userName)
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
            UserData: (await createUserData(user, userName)).toString('base64'),
            InstanceType: instanceType,
            EbsOptimized: true,
            IamInstanceProfile: {Name: 'ec2_instance_role_jetbrains'},
            BlockDeviceMappings: [
                {
                    "DeviceName": "/dev/xvda",
                    "Ebs": {
                        "Encrypted": true,
                        'VolumeType': 'gp3',
                        'VolumeSize': 32
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
            Type: ParameterType.SECURE_STRING,
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

export async function getSshKey(user) {
    const SSM = new SSMClient({region: 'eu-central-1'})
    try {
        return (await SSM.send(new GetParameterCommand({
            Name: '/ec2/key/' + user.replace('@', '-'),
            WithDecryption: true
        }))).Parameter.Value
    } catch (e) {
        if (e.name === 'ParameterNotFound') {
            return null
        }
        throw e
    }
}

export async function putSshKey(user, key) {
    key = key.trim()
    if (!key) {
        throw new Error('Missing public key data')
    }

    for (const keyLine of key.split("\n")) {
        // @see https://github.com/nemchik/ssh-key-regex
        if (keyLine.match(new RegExp('^(ssh-ed25519 AAAAC3NzaC1lZDI1NTE5|sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29t|ssh-rsa AAAAB3NzaC1yc2)[0-9A-Za-z+/]+[=]{0,3}(\s.*)?$'))) {
            throw new Error('Invalid public key format')
        }
    }

    const SSM = new SSMClient({region: 'eu-central-1'})
    await SSM.send(new PutParameterCommand({
        Name: '/ec2/key/' + user.replace('@', '-'),
        Value: key,
        Overwrite: false,
        Type: ParameterType.SECURE_STRING
    }))
}

async function createUserData(user, userName) {
    const sshKey = await getSshKey(user)

    const userData = readFileSync(`${__dirname}/user_data.sh`, 'utf8')
        .replace(/%attachUrl%/g, `${process.env.SELF_URL}attach-ebs?user=${encodeURIComponent(user)}`)
        .replace(/%aliasUrl%/g, `${process.env.SELF_URL}update-alias?user=${encodeURIComponent(user)}`)
        .replace(/%key%/g, sshKey)
        .replace(/%email%/g, user)
        .replace(/%userNameBase64%/g, Buffer.from(userName, 'utf8').toString('base64'))

    return Buffer.from(userData, 'utf8')
}

async function findSecurityGroup(user, region) {
    const filterTags = [
        {Name: 'tag:Name', Values: ['jetbrains']},
        {Name: 'tag:Owner', Values: [user]}
    ]

    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});

    const securityGroups = (await EC2.send(new DescribeSecurityGroupsCommand({
        Filters: filterTags
    })))

    if (securityGroups.SecurityGroups.length === 0) {
        return null
    }

    return securityGroups.SecurityGroups[0]
}

export async function getAllowedIps(user, region) {
    const securityGroup = await findSecurityGroup(user, region)
    if (!securityGroup) {
        return []
    }

    const ips = []
    securityGroup.IpPermissions.forEach(permission => {
        permission.IpRanges.forEach(range => {
            ips.push(range.CidrIp)
        })
    })

    return ips
}

export async function allowCurrentIp(user, region, ip) {
    const group = await findSecurityGroup(user, region)
    if (!group) {
        return;
    }
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    try {
        await EC2.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: group.GroupId,
            FromPort: 22,
            ToPort: 22,
            CidrIp: `${ip}/32`,
            IpProtocol: 'tcp'
        }))
    } catch (e) {
        console.log(e)
    }

    return {
        status: true
    }
}

export async function revokeIp(user, region, ip) {
    const group = await findSecurityGroup(user, region)
    if (!group) {
        return;
    }
    const EC2 = new EC2Client({apiVersion: '2016-11-15', region: region});
    try {
        await EC2.send(new RevokeSecurityGroupIngressCommand({
            GroupId: group.GroupId,
            FromPort: 22,
            ToPort: 22,
            CidrIp: ip,
            IpProtocol: 'tcp'
        }))
    } catch (e) {
        console.log(e)
    }

    return {
        status: true
    }
}
