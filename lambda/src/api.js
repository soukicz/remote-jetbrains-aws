const fs = require('fs')
const AWS = require('aws-sdk')

exports.startInstance = async function (user, ip) {
    const region = 'eu-central-1'
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

    const volumes = (await EC2.describeVolumes({
        Filters: filterTags
    }).promise()).Volumes

    let volume;
    if (volumes.length === 0) {
        volume = (await EC2.createVolume({
            VolumeType: 'gp3',
            Size: 30,
            AvailabilityZone: `${region}a`,
        }).promise())

        await EC2.createTags({
            Resources: [volume.VolumeId],
            Tags: tags
        }).promise()

        await EC2.waitFor('volumeAvailable', {VolumeIds: [volume.VolumeId]}).promise()
    } else {
        volume = volumes[0]
    }

    const securityGroups = (await EC2.describeSecurityGroups({
        Filters: filterTags
    }).promise()).SecurityGroups

    let securityGroup
    if (securityGroups.length === 0) {
        const vpc = (await EC2.describeVpcs({
            Filters: [
                {Name: 'is-default', Values: ['true']}
            ]
        }).promise()).Vpcs[0].VpcId

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

    try {
        await EC2.authorizeSecurityGroupIngress({
            GroupId: securityGroup,
            FromPort: 22,
            ToPort: 22,
            CidrIp: `${ip}/24`,
            IpProtocol: 'tcp'
        }).promise()
    } catch (e) {
        console.log(e)
    }

    const userData = fs.readFileSync(`${__dirname}/user_data.sh`, 'utf8')
        .replace(/%ebs_id%/g, volume.VolumeId)
        .replace(/%region%/g, region)

    await EC2.requestSpotFleet({
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
    }).promise();
}
