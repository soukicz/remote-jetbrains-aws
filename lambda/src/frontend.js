document.querySelector('.start-instance').addEventListener(function (e) {
    e.preventDefault()

    fetch('/api/start-instance')
        .then((response) => response.json())
        .then((data) => console.log(data))
})
