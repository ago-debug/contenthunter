#!/bin/bash
# DOCKER INSTALLATION & CONFIGURATION SCRIPT FOR VPS
# Target: Ubuntu / Debian

echo "🐳 Iniziando la configurazione di Docker sulla VPS..."

# 1. Aggiorna il sistema
sudo apt-get update
sudo apt-get upgrade -y

# 2. Installa le dipendenze necessarie
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 3. Aggiungi la chiave GPG ufficiale di Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 4. Imposta il repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Installa Docker Engine e Docker Compose Plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 6. Avvia e abilita Docker al boot
sudo systemctl enable docker
sudo systemctl start docker

# 7. Configura i permessi per l'utente corrente (per evitare 'sudo docker')
echo "👤 Configurazione permessi utente..."
sudo usermod -aG docker $USER

# 8. Configura il file daemon.json per ottimizzare i log (evita che la VPS si riempia)
echo "⚙️ Ottimizzazione gestione log Docker..."
sudo bash -c 'cat <<EOF > /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF'

# Riavvia Docker per applicare daemon.json
sudo systemctl restart docker

echo "✅ Docker e Docker Compose installati e configurati!"
echo "⚠️ NOTA: Per applicare i permessi del gruppo docker, scollega e ricollega la sessione SSH."
