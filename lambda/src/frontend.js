function callApi(url, button) {
    document.querySelector('.loading').style.display = 'block'
    button.style.display = 'none'


    fetch(url)
        .then((response) => response.json())
        .then((data) => {
            window.location.reload()
        })
        .catch(err => {
            document.querySelector('.loading').style.display = 'none'
            button.style.display = 'none'

            document.querySelector('.alert-danger').style.display = 'block'
            document.querySelector('.alert-danger').textContent = JSON.stringify(err)
        })
}

document.querySelector('.start-instance').addEventListener('click', function (e) {
    e.preventDefault()

    callApi('/api/start-instance', this)
})

document.querySelector('.terminate-instance').addEventListener('click', function (e) {
    e.preventDefault()

    callApi('/api/terminate-instance', this)
})

document.querySelector('.hibernate-instance').addEventListener('click', function (e) {
    e.preventDefault()

    callApi('/api/hibernate-instance', this)
})
