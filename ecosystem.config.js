module.exports = {
    apps: [
        {
            name: "pim-backend",
            script: "backend/main.py",
            cwd: ".",
            interpreter: "venv/bin/python3",
            env_file: ".env",
            env: {
                PYTHONPATH: "./backend"
            }
        },
        {
            name: "pim-ui",
            script: "ui_v5/main.py",
            cwd: ".",
            interpreter: "venv/bin/python3",
            env_file: ".env",
            env: {
                API_URL: "http://127.0.0.1:8000",
                PYTHONPATH: "./ui_v5"
            }
        }
    ]
};
