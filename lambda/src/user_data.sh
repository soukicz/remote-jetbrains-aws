#!/bin/bash

yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm

yum install -y awscli

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

## EBS
aws ec2 attach-volume --volume-id "%ebs_id%" --device /dev/xvde  --instance-id "$INSTANCE_ID" --region "%region%"
while [ ! -e /dev/xvde ] ; do sleep 1 ; done

DEVICE=${realpath /dev/xvde}

if [ "$(file -b -s $DEVICE)" == "data" ]; then
     mkfs -t ext4 /dev/xvde
fi

rm -rf /home/ec2-user
mkdir /home/ec2-user
mount /dev/xvde /home/ec2-user

sleep 5

chown ec2-user:ec2-user /home/ec2-user
chmod 700 /home/ec2-user

[ ! -d /home/ec2-user/.ssh ] && mkdir /home/ec2-user/.ssh

chmod 700 /home/ec2-user/.ssh
echo "%key%" > /home/ec2-user/.ssh/authorized_keys
chmod 600 /home/ec2-user/.ssh/authorized_keys
chown -R ec2-user:ec2-user /home/ec2-user/.ssh

