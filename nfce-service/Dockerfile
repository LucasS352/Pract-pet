FROM php:8.2-apache-bullseye

# ─── 1. Dependências do sistema e extensões PHP ───────────────────────────────
RUN apt-get update && apt-get install -y \
    libzip-dev zip unzip git libxml2-dev libssl-dev curl ca-certificates openssl \
    libfreetype6-dev libjpeg62-turbo-dev libpng-dev libonig-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install zip soap gd \
    && docker-php-ext-install mbstring \
    && rm -rf /var/lib/apt/lists/*

# ─── 2. CORREÇÃO OPENSSL 3.x / Bullseye: SECLEVEL=1 + TLS 1.2 ───────────────
# Em vez de usar sed (frágil, depende da estrutura do arquivo), criamos um
# openssl.cnf customizado completo que é referenciado pela variável OPENSSL_CONF.
# Isso garante SECLEVEL=1 e MaxProtocol=TLSv1.2 independente da imagem base.
COPY openssl-sefaz.cnf /etc/ssl/openssl-sefaz.cnf
ENV OPENSSL_CONF=/etc/ssl/openssl-sefaz.cnf

# ─── 3. Cadeia de Certificados ICP-Brasil (AC Raiz V5 e V10) ─────────────────
# Os servidores SEFAZ usam certificados emitidos pelas ACs ICP-Brasil.
# O container Debian não possui essas ACs na store padrão.
RUN curl -fsSL -o /usr/local/share/ca-certificates/icp-brasil-v5.crt \
        "http://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt" \
    && curl -fsSL -o /usr/local/share/ca-certificates/icp-brasil-v10.crt \
        "http://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt" \
    && update-ca-certificates \
    && echo "CA ICP-Brasil injetadas com sucesso."

# ─── 4. Instalar Composer ─────────────────────────────────────────────────────
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# ─── 5. Configuração do PHP: CA bundle, timeout e SSL ────────────────────────
RUN echo "openssl.cafile=/etc/ssl/certs/ca-certificates.crt" >> /usr/local/etc/php/php.ini \
    && echo "curl.cainfo=/etc/ssl/certs/ca-certificates.crt" >> /usr/local/etc/php/php.ini \
    && echo "default_socket_timeout=60" >> /usr/local/etc/php/php.ini

# ─── 6. Apache: Document Root ────────────────────────────────────────────────
ENV APACHE_DOCUMENT_ROOT /var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN a2enmod rewrite

# ─── 7. Copiar aplicação e instalar dependências PHP ─────────────────────────
WORKDIR /var/www/html
COPY . .
RUN composer install --no-dev --optimize-autoloader

# ─── 8. .htaccess para o Slim (front controller) ─────────────────────────────
RUN echo '<IfModule mod_rewrite.c>\n\
    RewriteEngine On\n\
    RewriteCond %{REQUEST_FILENAME} !-f\n\
    RewriteCond %{REQUEST_FILENAME} !-d\n\
    RewriteRule ^ index.php [QSA,L]\n\
</IfModule>' > public/.htaccess

EXPOSE 80
