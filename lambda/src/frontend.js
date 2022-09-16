function callApi(url) {
    document.querySelector('.loading').style.display = 'block'
    this.style.display = 'none'


    fetch(url)
        .then((response) => response.json())
        .then((data) => {
            window.location.reload()
        })
        .catch(err => {
            document.querySelector('.loading').style.display = 'none'
            this.style.display = 'none'

            document.querySelector('.alert-danger').style.display = 'block'
            document.querySelector('.alert-danger').textContent = JSON.stringify(err)
        })
}

document.querySelector('.start-instance').addEventListener('click', function (e) {
    e.preventDefault()

    callApi('/api/start-instance')
})

document.querySelector('.terminate-instance').addEventListener('click', function (e) {
    e.preventDefault()

    callApi('/api/terminate-instance')
})

document.querySelector('.hibernate-instance').addEventListener('click', function (e) {
    e.preventDefault()

    callApi('/api/hibernate-instance')
})
