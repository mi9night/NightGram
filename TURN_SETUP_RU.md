# TURN для NightGram 3.0

TURN нужен, когда два устройства не могут установить прямое WebRTC-соединение из-за NAT, мобильного оператора, корпоративной сети или firewall.

## Быстрый запуск на Linux VPS

1. Установите Docker и Docker Compose.
2. Откройте UDP/TCP `3478` и UDP-диапазон `49160-49200` в firewall и панели VPS.
3. Создайте DNS-запись `turn.example.com`, указывающую на публичный IPv4 сервера.
4. В папке `turn` скопируйте `turnserver.conf.example` в `turnserver.conf`.
5. Замените:
   - `CHANGE_ME_SAME_SECRET_AS_RAILWAY` на длинный случайный секрет;
   - `CHANGE_ME_PUBLIC_IPV4` на публичный IPv4;
   - `turn.example.com` на ваш домен.
6. Запустите:

```bash
docker compose up -d
```

## Переменные Railway backend

```env
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
TURN_SHARED_SECRET=ТОТ_ЖЕ_СЕКРЕТ_ЧТО_В_turnserver.conf
TURN_TTL_SECONDS=3600
```

После изменения переменных заново разверните папку `backend` на Railway. Frontend получает краткоживущие TURN-данные через защищённый маршрут `/api/calls/ice-config`; постоянный секрет в браузер не отправляется.

Для `turns:` добавьте корректный TLS-сертификат в coturn и URL `turns:turn.example.com:5349?transport=tcp` в `TURN_URLS`.
