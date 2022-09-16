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
    if (instance && instance.State.Name === 'running') {
        html += `
        <div> Status: ${instance.State.Name}</div>
            <br>
            <h4>IP: ${instance.PublicIpAddress}</h4>
            `
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
        html += `<a href="#" class="btn btn-succes btn-lg px-4 start-instance">Start instance</a>
    `
    }

    return render(html, user);
}
