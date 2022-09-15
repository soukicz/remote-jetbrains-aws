Content-Type: multipart/mixed; boundary="==BOUNDARY=="
MIME-Version: 1.0

--==BOUNDARY==
Content-Type: text/cloud-boothook; charset="us-ascii"

if [ -e /dev/nvme1n1 ] ; then
    cloud-init-per once docker_mkfs mkfs -t ext4 -L docker -i 4096 -F /dev/nvme1n1
    cloud-init-per once docker_rm rm -fr /var/lib/docker
    cloud-init-per once docker_mkdir mkdir /var/lib/docker
    cloud-init-per once docker_mount mount /dev/nvme1n1 /var/lib/docker
fi;

yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm

yum install -y awscli

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

## EBS
aws ec2 attach-volume --volume-id "%ebs_id%" --device /dev/xvde  --instance-id "$INSTANCE_ID" --region "%region%"
#while [ ! -e /dev/xvde ] ; do sleep 1 ; done

sleep 5

if [ "$(file -b -s /dev/xvde)" == "data" ]; then
     mkfs -t ext4 /dev/xvde
fi

#rm -rf /home/ec2-user
#mkdir /home/ec2-user
#mount /dev/xvde /home/ec2-user

sleep 5

chown ec2-user:ec2-user /home/ec2-user
chmod 700 /home/ec2-user

if [ -d /home/ec2-user/.ssh ] ; then
  mkdir /home/ec2-user/.ssh
  chmod 700 /home/ec2-user/.ssh
  echo "%key%" > /home/ec2-user/.ssh/authorized_keys
  chmod 600 /home/ec2-user/.ssh/authorized_keys
  chown -R ec2-user:ec2-user /home/ec2-user/.ssh
fi;

--==BOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash


--==BOUNDARY==--
