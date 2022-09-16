document.querySelector('.start-instance').addEventListener('click', function (e) {
    e.preventDefault()

    document.querySelector('.loading').style.display = 'block'
    this.style.display = 'none'


    fetch('/api/start-instance')
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
})
