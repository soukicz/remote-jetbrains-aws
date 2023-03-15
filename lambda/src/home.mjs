import render from "./render.mjs";
import {findInstance, getAllowedIps, getSshKey} from "./api.mjs";
import {EC2Client, DescribeRegionsCommand} from "@aws-sdk/client-ec2"
import {GetInstancePrices} from "./prices.mjs";

export default async function (user, region, currentIp) {

    let html = `
<div class="alert alert-danger" style="display: none"></div>
    <div class="progress loading" style="display: none">
  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;height:20px"></div>
</div>`

    let sshKey = await getSshKey(user);

    const instance = await findInstance(region, user)

    html += `
    <div class="container">
        <div class="row">
        <div class="col">`

    if (instance) {
        html += `
<h3>${region}</h3>
        <div> Status: ${instance.State.Name}</div>
            <br>`
    }
    if (instance && ['pending', 'running'].indexOf(instance.State.Name) > -1) {
        html += `Host: <strong>${user.replace(/[@.]/g, '-')}.${process.env.ALIAS_DOMAIN}</strong><br>
            User: <strong>ec2-user</strong><br>
            Type: <strong>${instance.InstanceType}</strong><br>
            IP: ${instance.PublicIpAddress}
            <br><br>`
        html += `

<a href="#" class="btn btn-warning px-4 stop-instance"><i class="fa fa-stop"></i> Stop instance</a>
&nbsp;
<a href="#" class="btn btn-danger px-4 terminate-instance"><i class="fa fa-stop"></i> Terminate instance</a>
    `

    } else {
        if (instance && instance.State.Name === 'stopped') {
            html += `
Type: <strong>${instance.InstanceType}</strong><br><br>
<a href="#" class="btn btn-danger px-4 terminate-instance"><i class="fa fa-stop"></i> Terminate instance</a>
    `
        }

        if (sshKey) {
            html += `<div class="btn-group">
              <button type="button" class="btn btn-success start-instance" data-type="${instance ? instance.InstanceType : 'r5a.large'}" >Start instance</button>
              <button type="button" class="btn btn-success dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">`

            const prices = await GetInstancePrices(region)
            for (const type in prices) {
                html += `<li><a class="dropdown-item start-instance" data-type="${type}" href="#">
                    ${type} (${prices[type].vcpu} vCPU, ${Math.round(prices[type].memory / 1024)}GB, $${prices[type].price}/h)
                </a></li>`
            }
            html += `</ul>
            </div>`
        }
        if (!instance) {
            html += `<br><br> 
                <div class="dropdown">
                  <button class="btn btn-warning dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    Migrate from ${region}
                  </button>
                  <ul class="dropdown-menu">`

            const EC2 = new EC2Client({apiVersion: '2016-11-15', region: 'eu-central-1'});
            const regions = (await EC2.send(new DescribeRegionsCommand({
                Filters: [
                    {Name: 'opt-in-status', Values: ['opt-in-not-required', 'opted-in']}
                ]
            }))).Regions
                .filter(otherRegion => {
                    return otherRegion.RegionName !== region
                }).map(otherRegion => {
                    return otherRegion.RegionName
                })

            for (const otherRegion of regions.sort()) {
                html += `<li><a class="dropdown-item migrate-instance" data-region="${otherRegion}" href="#">${otherRegion}</a></li>`
            }

            html += `</ul>
                </div>`
        }
    }

    html += `
    </div>
    <div class="col">
    <ul style="font-size: 80%">
        <li>instance is stopped after 15 minutes without SSH connection</li>
        <li>only /home/ec2-user/ directory is persisted during instance termination/migration</li>
    </ul>
    <h5>IP whitelist</h5>
    <ul>`
    let ipNeedsAllow = true
    for (const allowedIp of (await getAllowedIps(user, region))) {
        if (allowedIp === `${currentIp}/32`) {
            html += `<li><strong>${allowedIp.split('/')[0]}</strong> (current IP) (<a href="#" class="revoke-ip" data-ip="${allowedIp}">revoke</a>)</li>`
            ipNeedsAllow = false
        } else {
            html += `<li>${allowedIp.split('/')[0]} (<a href="#" class="revoke-ip" data-ip="${allowedIp}">revoke</a>)</li>`
        }
    }
    if (ipNeedsAllow) {
        html += `<li><a href="#" class="allow-current-ip">allow current IP (${currentIp})</a></li>`
    }
    html += '</ul>'

    html += `<h5>SSH key</h5>`
    if (sshKey) {
        html += `<span class="badge text-bg-primary">key configured</span>`
    } else {
        html += `
        <label for="ssh-value" class="form-label">Public SSH key</label>
        <textarea class="form-control" rows="3" id="ssh-value"></textarea>
        <button class="btn btn-primary" id="ssh-button">save key</button>`
    }

    html += '</div></div>'

    return render(html, user);
}
