document.querySelector('.start-instance').addEventListener('click', function (e) {
    e.preventDefault()

    fetch('/api/start-instance')
        .then((response) => response.json())
        .then((data) => console.log(data))
})
