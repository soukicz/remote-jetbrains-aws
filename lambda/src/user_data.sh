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

if [ -d /home/ec2-user/.ssh-server ]; then
  for name in ssh_host_ecdsa_key ssh_host_ed25519_key ssh_host_rsa_key
  do
    cp -f "/home/ec2-user/.ssh-server/$name" "/etc/ssh/$name"
    chown root:ssh_keys "/etc/ssh/$name"
    chmod 640 "/etc/ssh/$name"
    cp -f "/home/ec2-user/.ssh-server/$name.pub" "/etc/ssh/$name.pub"
    chown root:root "/etc/ssh/$name.pub"
    chmod 644 "/etc/ssh/$name.pub"
  done
  systemctl restart sshd.service
else
  mkdir /home/ec2-user/.ssh-server
  for name in ssh_host_ecdsa_key ssh_host_ed25519_key ssh_host_rsa_key
  do
    cp "/etc/ssh/$name" "/home/ec2-user/.ssh-server/$name"
    cp "/etc/ssh/$name.pub" "/home/ec2-user/.ssh-server/$name.pub"
  done
  chown -R root:root /home/ec2-user/.ssh-server
  chmod -R 600 /home/ec2-user/.ssh-server
  chmod 700 /home/ec2-user/.ssh-server
fi

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

AWS_ACCESS_KEY_ID="%awsId%" AWS_SECRET_ACCESS_KEY="%awsKey%" AWS_SESSION_TOKEN="%awsToken%" aws route53 change-resource-record-sets --hosted-zone-id "%hostedZone%" --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"%domain%","Type":"A","TTL":15,"ResourceRecords":[{"Value":"'"$PUBLIC_IP"'"}]}}]}'

## EBS
if mount | grep /home/ec2-user > /dev/null; then
  echo "already mounted"
else
  curl "%attachUrl%"
  aws ec2 attach-volume --volume-id "%ebs_id%" --device /dev/xvde  --instance-id "$INSTANCE_ID" --region "%region%"
  while [ ! -e /dev/xvde ] ; do sleep 1 ; done

  DEVICE=$(realpath /dev/xvde)

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

yum install -y git docker

git config --global user.name "%userName%"
git config --global user.email "%email%"

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.10.2/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

touch /tmp/.active-ssh

cat << EOF > /usr/bin/inactive-poweroff
#!/bin/bash

[ ! -f /tmp/.active-ssh ] && touch /tmp/.active-ssh

  if netstat -tna | grep ':22.*ESTABLISHED' > /dev/null; then
    touch /tmp/.active-ssh
  fi
  time=\$(stat -c %Y /tmp/.active-ssh)
  if [[ "\$time" -lt \$(( \$(date +%s) - 1200 )) ]]; then
    /sbin/poweroff
  fi

EOF

chmod +x /usr/bin/inactive-poweroff
(crontab -l 2>/dev/null || echo ""; echo "* * * * * /usr/bin/inactive-poweroff") | crontab -

--//