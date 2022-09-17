const fs = require('fs')
const AWS = require('aws-sdk')

async function findInstance(region, user) {
    const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: region});

    const list = await EC2.describeInstances({
        Filters: [
            {Name: 'tag:Name', Values: ['jetbrains']},
            {Name: 'tag:Owner', Values: [user]},
            {Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped', 'shutting-down']}
        ]

    }).promise()

    console.log(JSON.stringify(list))
    if (list.Reservations.length === 0) {
        return null;
    }
    if (list.Reservations[0].Instances.length === 0) {
        return null
    }

    return list.Reservations[0].Instances[0]
}

exports.findInstance = findInstance

exports.terminateInstance = async function (region, user) {
    const instance = await findInstance(region, user)
    if (!instance) {
        return {status: true}
    }
    const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: region});
    await EC2.terminateInstances({
        InstanceIds: [instance.InstanceId]
    }).promise()

    return {status: true}
}

exports.hibernateInstance = async function (region, user) {
    const instance = await findInstance(region, user)
    console.log(JSON.stringify(instance))
    if (!instance) {
        return {status: true}
    }
    const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: region});
    await EC2.stopInstances({
        InstanceIds: [instance.InstanceId],
        Hibernate: true
    }).promise()
    await EC2.waitFor('instanceStopped', {InstanceIds: [instance]}).promise()

    return {status: true}
}

async function findVolume(region, user, snapshot) {
    const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: region});
    const filterTags = [
        {Name: 'tag:Name', Values: ['jetbrains']},
        {Name: 'tag:Owner', Values: [user]}
    ]
    const tags = [
        {Key: 'Name', Value: 'jetbrains'},
        {Key: 'Owner', Value: user},
    ]
    const volumes = (await EC2.describeVolumes({
        Filters: filterTags
    }).promise()).Volumes
    if (volumes.length === 0) {
        const volume = (await EC2.createVolume({
            VolumeType: 'gp3',
            Size: 30,
            AvailabilityZone: `${region}a`,
            SnapshotId: snapshot ? snapshot : null
        }).promise())

        await EC2.createTags({
            Resources: [volume.VolumeId],
            Tags: tags
        }).promise()

        await EC2.waitFor('volumeAvailable', {VolumeIds: [volume.VolumeId]}).promise()
        return volume
    }
    return volumes[0]
}

async function findVpc(region) {
    const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: region});
    return (await EC2.describeVpcs({
        Filters: [
            {Name: 'is-default', Values: ['true']}
        ]
    }).promise()).Vpcs[0].VpcId
}

exports.startInstance = async function (region, user, ip, instanceType) {
    const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: region});
    const SSM = new AWS.SSM({region: region})

    const filterTags = [
        {Name: 'tag:Name', Values: ['jetbrains']},
        {Name: 'tag:Owner', Values: [user]}
    ]
    const tags = [
        {Key: 'Name', Value: 'jetbrains'},
        {Key: 'Owner', Value: user},
    ]

    const ami = JSON.parse((await SSM.getParameter({
        Name: '/aws/service/ecs/optimized-ami/amazon-linux-2/recommended',
        WithDecryption: true
    }).promise()).Parameter.Value).image_id

    const sshKey = (await SSM.getParameter({
        Name: '/ec2/key/' + user.replace('@', '-'),
        WithDecryption: true
    }).promise()).Parameter.Value

    let volume = await findVolume(region, user);

    const securityGroups = (await EC2.describeSecurityGroups({
        Filters: filterTags
    }).promise()).SecurityGroups

    let securityGroup
    if (securityGroups.length === 0) {
        const vpc = await findVpc(region)

        securityGroup = (await EC2.createSecurityGroup({
            GroupName: 'jetbrains-' + user.replace(/[^a-z\d]/g, ''),
            Description: 'jetbrains ' + user,
            VpcId: vpc
        }).promise()).GroupId

        await EC2.createTags({
            Resources: [securityGroup],
            Tags: tags
        }).promise()

        securityGroup = (await EC2.describeSecurityGroups({
            GroupIds: [securityGroup]
        }).promise()).SecurityGroups[0]

    } else {
        securityGroup = securityGroups[0].GroupId
    }

    for (const port of [22, 80, 443]) {
        try {
            await EC2.authorizeSecurityGroupIngress({
                GroupId: securityGroup,
                FromPort: port,
                ToPort: port,
                CidrIp: `${ip}/24`,
                IpProtocol: 'tcp'
            }).promise()
        } catch (e) {
            console.log(e)
        }
    }

    const userData = fs.readFileSync(`${__dirname}/user_data.sh`, 'utf8')
        .replace(/%ebs_id%/g, volume.VolumeId)
        .replace(/%region%/g, region)
        .replace(/%key%/g, sshKey)

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
            await EC2.startInstances({
                InstanceIds: [existingInstance.InstanceId]
            }).promise()
            await EC2.waitFor('instanceRunning', {
                InstanceIds: [existingInstance.InstanceId]
            }).promise()
        }
    } else if (!(await findInstance(region, user))) {
        const subnet = (await EC2.describeSubnets({
            Filters: [
                {Name: 'availability-zone', Values: [`${region}a`]},
                {Name: 'vpc-id', Values: [await findVpc(region)]}
            ]
        }).promise()).Subnets[0].SubnetId

        const instance = await EC2.runInstances({
            UserData: Buffer.from(userData, 'utf8').toString('base64'),
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
            HibernationOptions: {Configured: true},
            MinCount: 1,
            MaxCount: 1
        }).promise()

        await EC2.createTags({
            Resources: [instance.Instances[0].InstanceId],
            Tags: tags
        }).promise()

        await EC2.waitFor('instanceExists', {InstanceIds: [instance.Instances[0].InstanceId]}).promise()
    }

    return {
        status: true
    }
}

exports.migrate = async function (user, fromRegion, targetRegion) {
    const EC2from = new AWS.EC2({apiVersion: '2016-11-15', region: fromRegion});
    const EC2target = new AWS.EC2({apiVersion: '2016-11-15', region: targetRegion});

    const fromVolume = await findVolume(fromRegion, user)

    const snapshot = await EC2from.createSnapshot({
        Description: 'migrate-to-' + targetRegion,
        VolumeId: fromVolume.VolumeId,
    }).promise()

    await EC2from.waitFor('snapshotCompleted', {SnapshotIds: [snapshot.SnapshotId]}).promise()

    const newSnapshot = await EC2target.copySnapshot({
        SourceRegion: fromRegion,
        DestinationRegion: targetRegion,
        SourceSnapshotId: snapshot.SnapshotId,
        Description: 'migrate-from-' + fromRegion
    }).promise()

    await EC2target.waitFor('snapshotCompleted', {SnapshotIds: [newSnapshot.SnapshotId]}).promise()

    await findVolume(targetRegion, user, newSnapshot.SnapshotId)

    await (new AWS.SSM({region: 'eu-central-1'}))
        .putParameter({
            Name: '/ec2/region/' + user.replace('@', '-'),
            Value: targetRegion
        }).promise()

    await EC2from.deleteVolume({
        VolumeId: fromVolume.VolumeId
    }).promise()

}
