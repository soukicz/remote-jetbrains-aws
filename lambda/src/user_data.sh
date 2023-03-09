Content-Type: multipart/mixed; boundary="//"
MIME-Version: 1.0

--//
Content-Type: text/cloud-config; charset="us-ascii"
MIME-Version: 1.0
Content-Transfer-Encoding: 7bit
Content-Disposition: attachment; filename="cloud-config.txt"

#cloud-config
cloud_final_modules:
- [scripts-user, always]

--//
Content-Type: text/x-shellscript; charset="us-ascii"
MIME-Version: 1.0
Content-Transfer-Encoding: 7bit
Content-Disposition: attachment; filename="userdata.txt"

#!/bin/bash

yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm

yum install -y awscli

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

AWS_ACCESS_KEY_ID="%awsId%" AWS_SECRET_ACCESS_KEY="%awsKey%" AWS_SESSION_TOKEN="%awsToken%" aws route53 change-resource-record-sets --hosted-zone-id "%hostedZone%" --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"%domain%","Type":"A","TTL":15,"ResourceRecords":[{"Value":"'"$PUBLIC_IP"'"}]}}]}'

## EBS
if [ ! -e /dev/xvde ]; then
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
fi

chown ec2-user:ec2-user /home/ec2-user
chmod 700 /home/ec2-user

if [ ! -d /home/ec2-user/.ssh ]; then
  mkdir /home/ec2-user/.ssh
  chmod 700 /home/ec2-user/.ssh
  echo "%key%" > /home/ec2-user/.ssh/authorized_keys
  chmod 600 /home/ec2-user/.ssh/authorized_keys
  chown -R ec2-user:ec2-user /home/ec2-user/.ssh
fi

[ ! -f /home/ec2-user/.ssh/id_rsa ] && ssh-keygen -t rsa -f /home/ec2-user/.ssh/id_rsa -q -P ""

yum install -y git

git config --global user.name "%userName%"
git config --global user.email "%email%"

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.10.2/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

echo <<EOF
#!/bin/bash

touch /tmp/.active-ssh

while true
do
  if netstat -tna | grep ':22.*ESTABLISHED' > /dev/null; then
    touch /tmp/.active-ssh
  fi
  if [ -e /tmp/.active-ssh ]; then
    if [[ $(stat -c %Y /tmp/.active-ssh) -lt $(( $(date +%s) - 1200 )) ]]; then
      poweroff
    fi
  fi
  sleep 60
done
EOF > /usr/bin/inactive-poweroff

chmod +x /usr/bin/inactive-poweroff
/usr/bin/inactive-poweroff &

--//