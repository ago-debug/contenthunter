module.exports = {
    apps: [
        {
            name: "pim-backend",
            script: "main.py",
            cwd: "./backend",
            interpreter: "../venv/bin/python3",
            env: {
                PYTHONPATH: "."
            }
        },
        {
            name: "pim-ui",
            script: "main.py",
            cwd: "./ui_v5",
            interpreter: "../venv/bin/python3",
            env: {
                API_URL: "http://127.0.0.1:8000",
                PYTHONPATH: "."
            }
        }
    ]
};
