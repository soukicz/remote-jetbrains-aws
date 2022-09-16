const render = require('./render').render
const api = require('./api')

exports.render = async (user) => {

    let html = `
<div class="alert alert-danger" style="display: none"></div>
    <div class="progress loading" style="display: none">
  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;height:20px"></div>
</div>`

    const instance = await api.findInstance('eu-central-1', user)
    console.log(JSON.stringify(instance))
    if (instance && ['pending', 'running'].indexOf(instance.State.Name) > -1) {
        html += `
        <div> Status: ${instance.State.Name}</div>
            <br>
            <h4>IP: ${instance.PublicIpAddress}</h4>
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
              <button type="button" class="btn btn-danger start-instance">Start instance</button>
              <button type="button" class="btn btn-danger dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                <span class="visually-hidden">Toggle Dropdown</span>
              </button>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item start-instance" data-type="c5a.large" href="#">c5a.large</a></li>
                <li><a class="dropdown-item start-instance" data-type="c5a.xlarge" href="#">c5a.xlarge</a></li>
                <li><a class="dropdown-item start-instance" data-type="c5a.2xlarge" href="#">c5a.2xlarge</a></li>
                <li><a class="dropdown-item start-instance" data-type="c5a.4xlarge" href="#">c5a.4xlarge</a></li>
              </ul>
            </div>`
        }
    }

    return render(html, user);
}
