#!/bin/zsh
# Публикация мини-приложения: проверка → новый номер версии → загрузка на GitHub Pages.
#   ./release.sh "что изменилось"
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
node test.mjs
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s/(APP_VERSION = ')[^']*'/\1$V'/; s/\?v=[A-Za-z0-9]+/?v=$V/g" index.html
git add -A
git commit -q -m "${1:-Обновление} (версия $V)"
git push -q
echo "Опубликована версия $V — на сайте появится через 1–2 минуты."
