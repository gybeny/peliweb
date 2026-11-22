# This file is for building the Wings runtime on your own build host/registry.
# Rebuild regularly to receive upstream PHP/Alpine/nginx security updates.
FROM php:8.4-fpm-alpine

RUN apk add --no-cache nginx python3 ca-certificates icu-libs libzip \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS icu-dev libzip-dev \
    && docker-php-ext-install -j2 pdo_mysql mysqli intl zip opcache \
    && apk del .build-deps \
    && addgroup -g 1000 container \
    && adduser -D -u 1000 -G container -h /home/container container \
    && mkdir -p /opt/webnest /home/container \
    && chown -R container:container /home/container

COPY manager.py configuration.py selftest.py /opt/webnest/
USER container
ENV USER=container HOME=/home/container
WORKDIR /home/container
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["python3", "-u", "/opt/webnest/manager.py"]
