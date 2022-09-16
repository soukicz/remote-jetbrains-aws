function callApi(url, button) {
    document.querySelector('.loading').style.display = 'block'
    document.querySelectorAll('.btn').forEach(btn => {
        btn.style.display = 'none'
    })

    fetch(url)
        .then((response) => response.json())
        .then((data) => {
            window.location.reload()
        })
        .catch(err => {
            document.querySelector('.loading').style.display = 'none'
            document.querySelectorAll('.btn').forEach(btn => {
                btn.style.display = 'none'
            })

            document.querySelector('.alert-danger').style.display = 'block'
            document.querySelector('.alert-danger').textContent = JSON.stringify(err)
        })
}

if (document.querySelector('.start-instance')) {
    document.querySelector('.start-instance').addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/start-instance', this)
    })
}

if (document.querySelector('.terminate-instance')) {
    document.querySelector('.terminate-instance').addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/terminate-instance', this)
    })
}

if (document.querySelector('.hibernate-instance')) {
    document.querySelector('.hibernate-instance').addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/hibernate-instance', this)
    })
}
