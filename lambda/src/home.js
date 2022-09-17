const AWS = require('aws-sdk')
const render = require('./render').render
const api = require('./api')

exports.render = async (user, region) => {

    let html = `
<div class="alert alert-danger" style="display: none"></div>
    <div class="progress loading" style="display: none">
  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;height:20px"></div>
</div>`

    const instance = await api.findInstance(region, user)
    console.log(JSON.stringify(instance))
    if (instance) {
        html += `
<h3>${region}</h3>
        <div> Status: ${instance.State.Name}</div>
            <br>`
    }
    if (instance && ['pending', 'running'].indexOf(instance.State.Name) > -1) {
        html += `<h4>IP: ${instance.PublicIpAddress}</h4>
            <br>`
        html += `

<a href="#" class="btn btn-warning btn-lg px-4 hibernate-instance"><i class="fa fa-stop"></i> Stop instance</a>
&nbsp;
<a href="#" class="btn btn-danger btn-lg px-4 terminate-instance"><i class="fa fa-stop"></i> Terminate instance</a>
    `

    } else {
        if (instance && instance.State.Name === 'stopped') {
            html += `
<a href="#" class="btn btn-danger btn-lg px-4 terminate-instance"><i class="fa fa-stop"></i> Terminate instance</a>
    `
        }

        if (instance) {
            html += `<a href="#" class="btn btn-success btn-lg px-4 start-instance">Start instance</a>`
        } else {
            html += `<div class="btn-group">
              <button type="button" class="btn btn-success start-instance" data-type="c5.large" >Start instance</button>
              <button type="button" class="btn btn-success dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item start-instance" data-type="c5.large" href="#">c5.large</a></li>
                <li><a class="dropdown-item start-instance" data-type="c5.xlarge" href="#">c5.xlarge</a></li>
                <li><a class="dropdown-item start-instance" data-type="c5.2xlarge" href="#">c5.2xlarge</a></li>
                <li><a class="dropdown-item start-instance" data-type="c5.4xlarge" href="#">c5.4xlarge</a></li>
              </ul>
            </div>`
            html += `<br><br> 
                <div class="dropdown">
                  <button class="btn btn-warning dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    Migrate from ${region}
                  </button>
                  <ul class="dropdown-menu">`

            const EC2 = new AWS.EC2({apiVersion: '2016-11-15', region: 'eu-central-1'});
            const regions = (await EC2.describeRegions({
                Filters: [
                    {Name: 'opt-in-status', Values: ['opt-in-not-required', 'opted-in']}
                ]
            }).promise()).Regions
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

    return render(html, user);
}
