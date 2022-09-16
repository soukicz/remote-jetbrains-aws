const render = require('./render').render

exports.render = async (user) => {

    let html = `
    <div class="progress loading" style="display: none">
  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%"></div>
</div>
    <a href="#" class="btn btn-primary btn-lg px-4 start-instance">Start instance</a>
    `

    return render(html);
}
