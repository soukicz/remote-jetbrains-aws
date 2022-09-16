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
    if (!instance || instance.State.Name === 'running') {
        if (instance) {
            html += `
        <div> Status: ${instance.State.Name}</div>
            <br>
            `
        }
        html += `
<h4>IP: ${instance.PublicIpAddress}</h4>
<a href="#" class="btn btn-warning btn-lg px-4 hibernate-instance"><i class="fa fa-stop"></i> Stop instance</a>
&nbsp;
<a href="#" class="btn btn-danger btn-lg px-4 terminate-instance"><i class="fa fa-stop"></i> Terminate instance</a>
    `

    } else {
        if (instance.State.Name === 'stopped') {
            html += `
<a href="#" class="btn btn-danger btn-lg px-4 terminate-instance"><i class="fa fa-stop"></i> Terminate instance</a>
    `
        }
        html += `<a href="#" class="btn btn-primary btn-lg px-4 start-instance">Start instance</a>
    `
    }

    return render(html);
}
