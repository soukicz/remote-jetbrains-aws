const render = require('./render').render

exports.render = async (user) => {

    return render(`<a href="#" class="btn btn-primary btn-lg px-4 start-instance">Start instance</a>`);
}
