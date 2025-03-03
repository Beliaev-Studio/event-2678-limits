Это шаблон кода для разработки функций для Yandex cloud.

Функции Yandex cloud — это serverless сервис, который позволяет запускать код
в ответ на какой-то триггер. Обычно, триггер — это HTTP запрос.
Преимущество функций в том, что их удобно создавать под конкретные
мероприятия и удалять, после окончания мероприятий. Не нужно заботится о поддержке
и редактировать ядро системы.

## Принцип работы

При HTTP запросе, запускается функция handler, которая описана в index.js.
В параметре event этой функции передаются данные HTTP запроса.

В конце исполнения, функция должна вернуть объект, в котором указан HTTP код ответа,
заголовки и тело ответа.

## Параметр event

Документация: https://cloud.yandex.ru/docs/functions/concepts/function-invoke#http

**Несколько примеров**

Проверка метода запроса:

```js
if (event.httpMethod === 'POST') {
  return {
    statusCode: 405,
    headers: {
      Allow: 'GET'
    }
  }
}
```

Получение JSON данных из запроса:

```js
const body = JSON.parse(event.body)
```

## Ответ

По-умолчанию ответ уже содержит заголовок `Access-Control-Allow-Origin: *`,
но заголовка `Access-Control-Allow-Headers` нет, так что если в запросе используются
какие-то специальные заголовки, то нужно отдельно указать этот заголовок в ответе.

> Если передать функции заголовок Authorization, то функция будет пытаться авторизовать
отправителя запроса, даже если функция публичная. Это приведёт к ответу с кодом 403.

Документация: https://cloud.yandex.ru/docs/functions/concepts/function-invoke#response

**Примеры**

Обработка preflight запросов без исполнения основной логики:
```js
if (event.httpMethod === 'OPTIONS') {
    return {
        statusCode: 200
    }
}
```

Возвращаем JSON объект:
```js
 return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({success: true, errors: []})
}
```

## Локальное тестирование

Для того чтобы тестировать функцию локально, нужно создать файл
local-test.js (этот файл добавлен в .gitignore и не попадёт в репозиторий).

Базовое содержимое этого файла:
```js
const main = require('./index')

const event = {
  httpMethod: "GET",
  queryStringParameters: {userId: 123}
}

main.handler(event)
    .then((response) => {
      console.log(response)
    })
```

Для вызова этого файла, используйте команду
```shell
node local-test.js
```
В ответ, в консоли будет информация о возвращённом объекте функции.

**Секретные данные**

Функции часто работают с API ядра системы. Для доступа к API используются
токены или другие секреты, которые нельзя хранить в репозитории. Для решения
этой проблемы нужно использовать переменные окружения.

Пример
local-test.js:
```js
process.env.API_ENDPOINT = 'https://api.com'
process.env.TOKEN = 'VERY_SECRET_TOKEN'

const main = require('./index')

main.handler()
    .then((response) => {
      console.log(response)
    })
```

main.js:
```js
module.exports.handler = async function (event, context) {
  const response = axios.get(process.env.API_ENDPOINT,{
    headers: {
      Authorization: 'Bearer ' + process.env.TOKEN
    }
  })

  return {
    statusCode: 200,
    body: response.data
  }
}
```
