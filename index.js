const winston = require('winston')

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
})

/**
 * Для логирования, используйте функции:
 * `logger.debug()`
 * `logger.info()`
 * `logger.warn()`
 * `logger.error()`
 *
 * Можно отправлять как просто строки, например `logger.info('Информационное сообщение')`,
 * так и структурированные объекты с параметром message,
 * например `logger.debug({message: "Дебаг запроса", event: event})`
 * В последнем случае, в логах будет отображаться сообщение "Дебаг запроса", а информация
 * из объекта event буде доступна в раскрывающейся информации об этой записи.
 */




const { Firestore } = require('@google-cloud/firestore')

module.exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Headers': '*'
      }
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 500,
      headers: {
        'Allow': 'POST',
        'Access-Control-Allow-Headers': '*'
      }
    }
  }

  const referer = event.headers['Referer']
  if (!referer) {
    return {
      statusCode: 500,
      headers: {
        'Allow': 'POST',
        'Access-Control-Allow-Headers': '*'
      }
    }
  }

  const data = JSON.parse(event.body)

  if (!data['мастер-класс_не_нужен'] && !data['мастер-класс'] && data['мастер-класс'] !== 'string') {
    return {
      statusCode: 408,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*'
      },
      body: JSON.stringify({ errors: [{ message: 'Нет информации о мастер-классе' }] })
    }
  } else if (data['мастер-класс']) {
    const firestore = new Firestore({
      projectId: 'depreg',
      databaseId: '(default)',
      credentials: {
        client_email: process.env.CLIENT_EMAIL,
        private_key: process.env.PRIVATE_KEY.split(String.raw`\n`).join('\n')
      }
    })

    const eventDocName = referer.includes(':8000') ? `-${data.eventId}` : data.eventId
    let masterClassesList =  data['мастер-класс'].split(',').map(item => item.trim().replaceAll(' ', '_'))

    if(!masterClassesList.length) {
      return {
        statusCode: 407,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Headers': '*'
        },
        body: JSON.stringify({ errors: [{ message: 'Ошибка передачи данных' }] })
      }
    }

    try {
      await firestore.runTransaction(async (transaction) => {
        const masterClassesRefs = masterClassesList.map((classes) => {
          return firestore.doc(`/Events/${-eventDocName}/limits/${classes}`)
        })

        const masterClassesDocs = await Promise.all(masterClassesRefs.map(ref => transaction.get(ref)))

        for (let classes of masterClassesDocs) {
          console.log(classes.exists)
          if (!classes.exists) {
            throw {
              code: 404,
              msg: 'Ошибка в указании названия мастер-класса'
            }
          }

          const max = classes.get('max')
          const current = classes.get('current')

          if (max < current + 1) {
            throw {
              code: 409,
              msg: 'На выбранный мастер-класса закончились места'
            }
          }
        }

        masterClassesRefs.forEach((ref, index) => {
          transaction.update(ref, { current: masterClassesDocs[index].data().current + 1 })
        })
      })
    } catch (e) {
      if (e.code === 404) {
        return {
          statusCode: 404,
          headers: {
            'Allow': 'POST',
            'Access-Control-Allow-Headers': '*'
          },
          body: JSON.stringify({ errors: [{ message: e.msg }] })
        }
      }

      if (e.code === 408) {
        return {
          statusCode: 408,
          headers: {
            'Allow': 'POST',
            'Access-Control-Allow-Headers': '*'
          },
          body: JSON.stringify({ errors: [{ message: e.msg }] })
        }
      }

      if (e.code === 409) {
        return {
          statusCode: 409,
          headers: {
            'Allow': 'POST',
            'Access-Control-Allow-Headers': '*'
          },
          body: JSON.stringify({ errors: [{ message: e.msg }] })
        }
      }

      return {
        statusCode: 500,
        headers: {
          'Allow': 'POST',
          'Access-Control-Allow-Headers': '*'
        },
        body: JSON.stringify({ errors: [{ message: e }] })
      }
    }
  }

  try {
    const participantId = await registerParticipants(referer, data)
    if (!participantId) {
      console.error('Не был получен ID пользователя')

      throw {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Headers': '*'
        },
        body: JSON.stringify({ errors: [{ message: 'Не был получен ID пользователя' }] })
      }
    }
  } catch (e) {
    if (data['мастер-класс']) {
      const firestore = new Firestore({
        projectId: 'depreg',
        databaseId: '(default)',
        credentials: {
          client_email: process.env.CLIENT_EMAIL,
          private_key: process.env.PRIVATE_KEY.split(String.raw`\n`).join('\n')
        }
      })

      const eventDocName = referer.includes(':8000') ? `-${data.eventId}` : data.eventId
      let masterClassesList =  data['мастер-класс'].split(',').map(item => item.trim().replaceAll(' ', '_'))

      if(!masterClassesList.length) {
        return {
          statusCode: 406,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Headers': '*'
          },
          body: JSON.stringify({ errors: [{ message: 'Ошибка транзакции' }] })
        }
      }

      try {
        await firestore.runTransaction(async (transaction) => {
          const masterClassesRefs = masterClassesList.map((classes) => {
            return firestore.doc(`/Events/${-eventDocName}/limits/${classes}`)
          })

          const masterClassesDocs = await Promise.all(masterClassesRefs.map(ref => transaction.get(ref)))

          for (let index= 0; index < masterClassesDocs.length; index++) {
            const classes = masterClassesDocs[index]
            const current = classes.get('current')

            if (0 > current - 1) {
              throw {
                msg: 'Ошибка транзакции'
              }
            }

            transaction.update(masterClassesRefs[index], { current: classes.data().current - 1 })
          }
        })
      } catch (e) {
        console.error(e)
      }
    }

    return e
  }

  return {
    statusCode: 200
  }
}

const registerParticipants = async function (referer, data) {
  let formData = new FormData()
  for (let key in data) {
    formData.append(key, data[key])
  }

  const options = {
    method: 'POST',
    headers: {
      'Referer': referer
    },
    body: formData
  }

  const response = await fetch('https://depreg.ew.r.appspot.com', options).catch(() => {
    throw {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*'
      },
      body: JSON.stringify({ errors: [{ message: 'Failed to fetch' }] })
    }
  })

  const participant = await response.json().catch(() => {
    throw {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*'
      },
      body: JSON.stringify({ errors: [{ message: 'Failed to parse JSON' }] })
    }
  })

  if (!response.ok) {
    throw  {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*'
      },
      body: JSON.stringify({ errors: [{ message: participant.message }] })
    }
  }

  return participant.id
}

