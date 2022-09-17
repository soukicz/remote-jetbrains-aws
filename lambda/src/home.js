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
            html += `&nbsp;&nbsp;&nbsp; <div class="btn-group">
              <button type="button" class="btn btn-warning start-instance" data-type="c5.large" >Migrate from ${region}</button>
              <button type="button" class="btn btn-warning dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item migrate-instance" data-region="eu-central-1" href="#">eu-central-1</a></li>
                <li><a class="dropdown-item migrate-instance" data-region="eu-west-1" href="#">eu-west-1</a></li>
                <li><a class="dropdown-item migrate-instance" data-region="eu-west-2" href="#">eu-west-2</a></li>
                <li><a class="dropdown-item migrate-instance" data-region="eu-west-3" href="#">eu-west-3</a></li>
                <li><a class="dropdown-item migrate-instance" data-region="eu-north-3" href="#">eu-north-3</a></li>
                <li><a class="dropdown-item migrate-instance" data-region="af-south-1" href="#">af-south-1</a></li>
              </ul>
            </div>`
        }
    }

    return render(html, user);
}
