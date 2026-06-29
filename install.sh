#!/usr/bin/env bash
# =============================================================================
#  WPPConnect SaaS — Script de Instalação
#  Compatível com: Ubuntu 20.04 / 22.04 / 24.04 · Debian 11 / 12
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $*"; }
die()     { echo -e "${RED}[ERRO]${NC}  $*" >&2; exit 1; }
section() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "  $*"
  echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

prompt() {
  # prompt "Texto" "default" → lê input, retorna default se vazio
  local text="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    echo -ne "${BOLD}${text}${NC} [${CYAN}${default}${NC}]: "
  else
    echo -ne "${BOLD}${text}${NC}: "
  fi
  read -r _REPLY
  echo "${_REPLY:-$default}"
}

prompt_secret() {
  local text="$1"
  echo -ne "${BOLD}${text}${NC}: "
  read -rs _REPLY
  echo ""
  echo "$_REPLY"
}

confirm() {
  # confirm "Texto" → retorna 0 se s/sim/y/yes, 1 caso contrário
  echo -ne "${BOLD}$1${NC} ${CYAN}[s/N]${NC}: "
  read -r _C
  [[ "${_C,,}" == "s" || "${_C,,}" == "sim" || "${_C,,}" == "y" || "${_C,,}" == "yes" ]]
}

gen_secret() { openssl rand -hex 32; }

# ─── Cabeçalho ────────────────────────────────────────────────────────────────
print_header() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║          WPPConnect SaaS — Instalação                ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  Este script irá configurar o ambiente completo:"
  echo -e "  Docker · Containers · SSL · Firewall · Credenciais\n"
}

# ─── 1. Verificações iniciais ─────────────────────────────────────────────────
check_requirements() {
  section "1/8 · Verificações iniciais"

  # Root
  [[ $EUID -eq 0 ]] || die "Execute como root: sudo bash install.sh"
  ok "Executando como root."

  # Diretório correto (deve ter docker-compose.yaml)
  [[ -f "docker-compose.yaml" ]] || \
    die "Execute o script na raiz do projeto (onde está o docker-compose.yaml)."
  ok "Diretório do projeto: $(pwd)"

  # Detectar OS
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="$ID"
    OS_CODENAME="${VERSION_CODENAME:-}"
    ok "Sistema: ${PRETTY_NAME}"
  else
    die "Sistema operacional não suportado (falta /etc/os-release)."
  fi

  # Arquitetura
  ARCH=$(uname -m)
  ok "Arquitetura: $ARCH"
}

# ─── 2. Fuso horário e data/hora ─────────────────────────────────────────────
configure_timezone() {
  section "2/8 · Data, hora e fuso horário"

  CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "UTC")
  info "Fuso atual: ${CURRENT_TZ}"

  TIMEZONE=$(prompt "Fuso horário (lista em /usr/share/zoneinfo)" "America/Sao_Paulo")

  if timedatectl set-timezone "$TIMEZONE" 2>/dev/null; then
    ok "Fuso configurado: $TIMEZONE"
  else
    warn "Não foi possível definir o fuso. Continuando com $CURRENT_TZ."
    TIMEZONE="$CURRENT_TZ"
  fi

  # Sincronizar via NTP
  if timedatectl set-ntp true 2>/dev/null; then
    ok "Sincronização NTP ativada."
  fi

  # Instalar/atualizar tzdata sem interatividade
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tzdata 2>/dev/null || true
  ln -snf "/usr/share/zoneinfo/${TIMEZONE}" /etc/localtime
  echo "$TIMEZONE" > /etc/timezone

  info "Data/hora atual: $(date '+%d/%m/%Y %H:%M:%S %Z')"
}

# ─── 3. Atualizar sistema ─────────────────────────────────────────────────────
system_update() {
  section "3/8 · Atualização do sistema"

  info "Atualizando lista de pacotes..."
  apt-get update -qq

  info "Instalando dependências essenciais..."
  apt-get install -y -qq \
    curl wget gnupg lsb-release ca-certificates \
    apt-transport-https software-properties-common \
    openssl ufw git 2>/dev/null

  ok "Dependências instaladas."
}

# ─── 4. Docker ────────────────────────────────────────────────────────────────
install_docker() {
  section "4/8 · Docker Engine"

  if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version)
    ok "Docker já instalado: $DOCKER_VER"

    if ! docker compose version &>/dev/null; then
      info "Instalando Docker Compose plugin..."
      apt-get install -y -qq docker-compose-plugin
      ok "Docker Compose plugin instalado."
    else
      ok "Docker Compose: $(docker compose version)"
    fi
    return 0
  fi

  info "Removendo versões antigas do Docker (se existirem)..."
  apt-get remove -y -qq docker docker-engine docker.io containerd runc 2>/dev/null || true

  info "Adicionando repositório oficial do Docker..."
  install -m 0755 -d /etc/apt/keyrings

  # Chave GPG
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Repositório
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker

  ok "Docker instalado: $(docker --version)"
  ok "Compose: $(docker compose version)"
}

# ─── 5. Credenciais e variáveis de ambiente ───────────────────────────────────
configure_credentials() {
  section "5/8 · Credenciais e configuração"

  # ── Domínio ──
  DOMAIN=$(prompt "Domínio ou IP público do servidor (ex: app.empresa.com)" "localhost")

  if [[ "$DOMAIN" == "localhost" || "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    FRONTEND_URL="http://${DOMAIN}"
    USE_SSL=false
  else
    FRONTEND_URL="https://${DOMAIN}"
    USE_SSL=true
  fi
  info "Frontend URL: ${FRONTEND_URL}"

  # ── Admin ──
  ADMIN_EMAIL=$(prompt "E-mail do administrador inicial" "admin@localhost")

  # ── JWT ──
  JWT_SECRET=$(gen_secret)
  ok "JWT_SECRET gerado automaticamente (64 chars)."

  # ── Banco de dados ──
  echo ""
  info "Senha do banco de dados (Enter = gerar aleatória):"
  DB_PASS_INPUT=$(prompt_secret "  Senha (oculta)")
  DB_PASSWORD="${DB_PASS_INPUT:-$(gen_secret)}"
  ok "DB_PASSWORD configurado."

  # ── WppConnect ──
  WPP_SERVER_IMAGE=$(prompt "Imagem do runtime WppConnect" "wppconnect/wppconnect-server:develop")
  WPP_SERVER=$(prompt "URL interna do runtime WppConnect" "http://runtime:21465/api")
  WPP_DEFAULT_PROVIDER=$(prompt "Provider padrão para novas sessões" "wppconnect")

  echo ""
  info "Token secreto do servidor WppConnect (Enter = gerar aleatório):"
  WPP_INPUT=$(prompt_secret "  WPP_SECRET_KEY (oculta)")
  WPP_SECRET_KEY="${WPP_INPUT:-$(gen_secret)}"
  ok "WPP_SECRET_KEY configurado."

  # ── SMTP ──
  SMTP_HOST=""; SMTP_PORT="587"; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""
  echo ""
  if confirm "Configurar SMTP para envio de e-mail (recuperação de senha)"; then
    SMTP_HOST=$(prompt    "  Servidor SMTP (ex: smtp.gmail.com)" "")
    SMTP_PORT=$(prompt    "  Porta SMTP" "587")
    SMTP_USER=$(prompt    "  Usuário SMTP" "")
    SMTP_PASS=$(prompt_secret "  Senha SMTP (oculta)")
    SMTP_FROM=$(prompt    "  E-mail remetente" "noreply@${DOMAIN}")
    ok "SMTP configurado: ${SMTP_HOST}:${SMTP_PORT}"
  else
    warn "SMTP não configurado — links de recuperação serão exibidos no log do container."
  fi
}

# ─── 6. Gravar .env ───────────────────────────────────────────────────────────
write_env_file() {
  info "Gravando .env..."

  cat > .env <<EOF
# Gerado por install.sh em $(date '+%d/%m/%Y %H:%M:%S %Z')
# NÃO versione este arquivo.

JWT_SECRET=${JWT_SECRET}
DB_PASSWORD=${DB_PASSWORD}
WPP_SECRET_KEY=${WPP_SECRET_KEY}
WPP_SERVER_IMAGE=${WPP_SERVER_IMAGE}
WPP_SERVER=${WPP_SERVER}
WPP_DEFAULT_PROVIDER=${WPP_DEFAULT_PROVIDER}
FRONTEND_URL=${FRONTEND_URL}
ADMIN_EMAIL=${ADMIN_EMAIL}

# SMTP (deixe vazio para exibir o link de reset no log do container)
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}
EOF

  chmod 600 .env
  ok ".env criado com permissão 600 (apenas root pode ler)."
}

# ─── 7. SSL ───────────────────────────────────────────────────────────────────
configure_ssl() {
  section "6/8 · SSL / HTTPS"

  mkdir -p ssl

  if [[ "$USE_SSL" == true ]]; then
    # ── Let's Encrypt ──
    info "Tentando obter certificado Let's Encrypt para ${DOMAIN}..."

    apt-get install -y -qq certbot

    # Certbot standalone precisa da porta 80 livre
    if ss -tlnp | grep -q ':80 '; then
      warn "Porta 80 em uso. Encerrando processo temporariamente para validação."
      fuser -k 80/tcp 2>/dev/null || true
      sleep 2
    fi

    if certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --register-unsafely-without-email \
        -d "$DOMAIN" 2>&1 | tee /tmp/certbot.log; then

      cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ssl/fullchain.pem
      cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"   ssl/privkey.pem
      SSL_CERT="ssl/fullchain.pem"
      SSL_KEY="ssl/privkey.pem"
      ok "Certificado Let's Encrypt obtido."

      # Cron de renovação automática
      CRON_JOB="0 3 * * * certbot renew --quiet --deploy-hook 'docker restart wppconnect-frontend'"
      (crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "$CRON_JOB") | crontab -
      ok "Renovação automática agendada (cron diário às 03:00)."
    else
      warn "Let's Encrypt falhou (ver /tmp/certbot.log). Usando certificado autoassinado."
      generate_self_signed_cert
    fi
  else
    # ── Autoassinado (IP / localhost) ──
    info "Gerando certificado autoassinado para ${DOMAIN}..."
    generate_self_signed_cert
  fi

  write_nginx_ssl_config
  write_compose_override
}

generate_self_signed_cert() {
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout ssl/privkey.pem \
    -out    ssl/fullchain.pem \
    -subj   "/C=BR/ST=SP/L=SaoPaulo/O=WppConnect/OU=Auto/CN=${DOMAIN}" \
    2>/dev/null
  SSL_CERT="ssl/fullchain.pem"
  SSL_KEY="ssl/privkey.pem"
  ok "Certificado autoassinado gerado (10 anos)."
}

write_nginx_ssl_config() {
  info "Gerando configuração Nginx para HTTPS..."
  CERT_FILE=$(basename "$SSL_CERT")
  KEY_FILE=$(basename "$SSL_KEY")

  cat > ssl/nginx-ssl.conf <<NGINX
# Gerado por install.sh — não edite manualmente
server {
    listen 80;
    server_name _;
    server_tokens off;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name _;
    server_tokens off;

    ssl_certificate     /etc/nginx/ssl/${CERT_FILE};
    ssl_certificate_key /etc/nginx/ssl/${KEY_FILE};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    root  /usr/share/nginx/html;
    index index.html;

    add_header X-Content-Type-Options    "nosniff"                         always;
    add_header X-Frame-Options           "SAMEORIGIN"                      always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()" always;
    add_header X-XSS-Protection          "0"                               always;
    add_header X-DNS-Prefetch-Control    "off"                             always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy   "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';" always;

    location /api/ {
        proxy_pass         http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    location /api/logs/stream {
        proxy_pass             http://api:3000;
        proxy_http_version     1.1;
        proxy_set_header       Host              \$host;
        proxy_set_header       X-Real-IP         \$remote_addr;
        proxy_set_header       X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header       X-Forwarded-Proto \$scheme;
        proxy_set_header       Connection        '';
        proxy_read_timeout     1860s;
        proxy_buffering        off;
        proxy_cache            off;
        chunked_transfer_encoding on;
    }

    location /health {
        proxy_pass http://api:3000;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    location ~* \.(js|css|woff2?|ttf|eot|svg|png|jpg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location ~ /\. {
        deny all;
        return 404;
    }
}
NGINX

  ok "ssl/nginx-ssl.conf gerado."
}

write_compose_override() {
  info "Gerando docker-compose.override.yml para SSL..."

  cat > docker-compose.override.yml <<'OVERRIDE'
# Gerado por install.sh — sobrescreve docker-compose.yaml para SSL
services:
  frontend:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
      - ./ssl/nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro
OVERRIDE

  ok "docker-compose.override.yml criado."
}

# ─── 8. Firewall ──────────────────────────────────────────────────────────────
configure_firewall() {
  section "7/8 · Firewall"

  if ! command -v ufw &>/dev/null; then
    warn "ufw não encontrado. Pulando configuração de firewall."
    return 0
  fi

  info "Configurando ufw..."
  ufw --force reset    >/dev/null 2>&1
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow ssh        comment 'SSH'
  ufw allow 80/tcp     comment 'HTTP'
  ufw allow 443/tcp    comment 'HTTPS'
  ufw --force enable   >/dev/null 2>&1

  ok "Firewall ativo. Regras:"
  ufw status numbered | grep -v "^Status" | grep -v "^$" || true
}

# ─── 9. Build e start dos containers ─────────────────────────────────────────
build_and_start() {
  section "8/8 · Build e inicialização dos containers"

  info "Construindo imagens Docker (pode levar alguns minutos)..."
  docker compose up -d --build --remove-orphans

  # Aguardar banco
  info "Aguardando banco de dados ficar saudável..."
  RETRIES=30
  until docker compose exec -T db pg_isready -U wppconnect -d wppconnect &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    [[ $RETRIES -eq 0 ]] && die "Banco não ficou pronto após 60s. Verifique: docker logs wppconnect-db"
    printf "."
    sleep 2
  done
  echo ""
  ok "Banco de dados pronto."

  # Aguardar API
  info "Aguardando API inicializar..."
  RETRIES=20
  until curl -sf "http://localhost:3000/health" &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    [[ $RETRIES -eq 0 ]] && { warn "API demorou para responder. Verifique: docker logs wppconnect-api"; break; }
    sleep 3
  done
  ok "API respondendo."

  ok "Containers em execução:"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
}

# ─── Resumo final ─────────────────────────────────────────────────────────────
print_summary() {
  # Busca a senha temporária nos logs da API
  TEMP_CREDS=$(docker logs wppconnect-api 2>&1 | grep -A3 "PRIMEIRO ACESSO" | tail -5 || echo "  Ver: docker logs wppconnect-api")

  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║                Instalação concluída!                     ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Acesso:${NC}         ${CYAN}${FRONTEND_URL}${NC}"
  echo -e "  ${BOLD}Admin e-mail:${NC}   ${CYAN}${ADMIN_EMAIL}${NC}"
  echo -e "  ${BOLD}Domínio:${NC}        ${CYAN}${DOMAIN}${NC}"
  echo -e "  ${BOLD}Fuso horário:${NC}   ${CYAN}${TIMEZONE}${NC}"
  echo ""
  echo -e "  ${YELLOW}${BOLD}Credenciais temporárias do admin (log do container):${NC}"
  echo "$TEMP_CREDS" | sed 's/^/    /'
  echo ""
  echo -e "  ${BOLD}Arquivos gerados:${NC}"
  echo -e "    .env                         — variáveis de ambiente (chmod 600)"
  [[ "$USE_SSL" == true ]] && \
  echo -e "    ssl/                         — certificados SSL"
  [[ "$USE_SSL" == true ]] && \
  echo -e "    docker-compose.override.yml  — config HTTPS"
  echo ""
  echo -e "  ${BOLD}Comandos úteis:${NC}"
  echo -e "    ${CYAN}docker logs wppconnect-api -f${NC}        — logs da API"
  echo -e "    ${CYAN}docker logs wppconnect-frontend -f${NC}   — logs do Nginx"
  echo -e "    ${CYAN}docker compose restart${NC}               — reiniciar todos"
  echo -e "    ${CYAN}docker compose down${NC}                  — parar"
  echo -e "    ${CYAN}docker compose up -d --build${NC}         — rebuild e reiniciar"
  echo ""
  echo -e "  ${RED}IMPORTANTE:${NC} Acesse o sistema e troque a senha do admin imediatamente."
  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  print_header

  check_requirements
  configure_timezone
  system_update
  install_docker
  configure_credentials
  write_env_file

  echo ""
  if confirm "Configurar SSL/HTTPS (recomendado para produção)"; then
    configure_ssl
  else
    USE_SSL=false
    warn "SSL não configurado. Acesso via HTTP apenas."
  fi

  configure_firewall
  build_and_start
  print_summary
}

main "$@"
