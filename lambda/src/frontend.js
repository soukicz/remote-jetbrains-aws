function callApi(url, data) {
    document.querySelector('.loading').style.display = 'block'
    document.querySelectorAll('.btn, .btn-group, .dropdown, .container').forEach(btn => {
        btn.style.display = 'none'
    })

    fetch(url, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data)
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                document.querySelector('.loading').style.display = 'none'
                document.querySelectorAll('.btn, .btn-group, .dropdown').forEach(btn => {
                    btn.style.display = 'none'
                })

                document.querySelector('.alert-danger').style.display = 'block'
                document.querySelector('.alert-danger').textContent = data.error
            }else{
                window.location.reload()
            }
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

        callApi('/api/start-instance?type=' + encodeURIComponent(this.dataset.type))
    })
});

document.querySelectorAll('.migrate-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/migrate-instance?target=' + encodeURIComponent(this.dataset.region))
    })
});

document.querySelectorAll('.terminate-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/terminate-instance')
    })
})

document.querySelectorAll('.stop-instance').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/stop-instance')
    })
});

document.querySelectorAll('.allow-current-ip').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi('/api/allow-current-ip')
    })
});

document.querySelectorAll('.revoke-ip').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()

        callApi(`/api/revoke-ip?ip=${encodeURIComponent(this.dataset.ip)}`)
    })
});

document.querySelectorAll('.ssh-button').forEach(function (button) {
    button.addEventListener('click', function (e) {
        e.preventDefault()
        const key = document.getElementById('ssh-value').value.trim()
        if (!key) {
            alert('Missing public key')
            return;
        }
        for(const keyLine of key.split("\n")) {
            // @see https://github.com/nemchik/ssh-key-regex
            if (keyLine.match(new RegExp('^(ssh-ed25519 AAAAC3NzaC1lZDI1NTE5|sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29t|ssh-rsa AAAAB3NzaC1yc2)[0-9A-Za-z+/]+[=]{0,3}(\s.*)?$'))) {
                alert('Invalid public key format')
                return;
            }
        }
        callApi(`/api/update-ssh-key`, {key: key})
    })
});
