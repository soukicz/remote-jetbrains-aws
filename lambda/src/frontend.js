function callApi(url) {
    document.querySelector('.loading').style.display = 'block'
    document.querySelectorAll('.btn, .btn-group, .dropdown').forEach(btn => {
        btn.style.display = 'none'
    })

    fetch(url)
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                throw new Error(data.error)
            }
            window.location.reload()
        })
        .catch(err => {
            document.querySelector('.loading').style.display = 'none'
            document.querySelectorAll('.btn, .btn-group, .dropdown').forEach(btn => {
                btn.style.display = 'none'
            })

            document.querySelector('.alert-danger').style.display = 'block'
            document.querySelector('.alert-danger').textContent = JSON.stringify(err)
        })
}

document.querySelectorAll('.start-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/start-instance?type=' + encodeURIComponent(this.dataset.type), this)
    })
});

document.querySelectorAll('.migrate-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/migrate-instance?target=' + encodeURIComponent(this.dataset.region), this)
    })
});

document.querySelectorAll('.terminate-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/terminate-instance', this)
    })
})

document.querySelectorAll('.hibernate-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/hibernate-instance', this)
    })
});
