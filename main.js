const http = require('http');
const url = require('url');
const redis = require('redis');

const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 8080;
const CACHE_TIMEOUT = process.env.CACHE_TIMEOUT || 3600000; // milissegundos

const cache = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_HOST,
  {
    auth_pass: process.env.REDIS_ACCESS_KEY,
    tls: {
      servername: process.env.REDIS_HOST
    }
  });

// se retornar nil, ou não há valor no cache ou o valor é muito antigo
function checkCache(cache, key) {
  return new Promise((resolve, reject) => {
    console.log('Resolvendo %s no cache...', key);
    cache.hgetall(key, function (err, val) {
      if(err) {
        console.error('Erro ao pegar %s no cache: %s', key, err);
        reject(err);
        return;
      }

      const now = Date.now();
      if(!val) {
        console.log('%s não encontrado em cache', key);
        resolve(false); // resolve(nil) dá erro
      } else if (val.timestamp <= now - CACHE_TIMEOUT) {
        console.log('%s com valor muito antigo (carimbo no cache: %s, carimbo agora: %s)', key, val.timestamp, now);
        resolve(false); // resolve(nil) dá erro
      } else {
        console.log('Obtendo o valor de %s no cache', key);
        resolve(val.value);
      }
    });
  });
}

function updateCache(cache, key, value) {
  return new Promise((resolve, reject) => {
    console.log('Atualizando %s no cache...', key);
    cache.hmset(key, 
      'timestamp', Date.now(), 
      'value', value,
      (err, v) => {
        if(err) { 
          console.error('Erro ao atualizar %s no cache: %s', key, err);
          reject(err); 
          return;
        }

        console.log('%s com novo valor no cache', key);
        resolve(value);
      });
  });
}

function deleteCache(cache, key) {
  return new Promise((resolve, reject) => {
    console.log('Limpando %s do cache...', key);
    cache.hdel(key, (err, v) => {
      if(err) {
        console.error('Erro ao limpar %s do cache: %s', key, err);
        reject(err);
        return;
      }

      console.log('%s removido do cache', key);
      resolve(true);
    });
  });
}

function bodyOf(request) {
  return new Promise((resolve, reject) => {
    let body = [];

    request.on('error', (err) => { reject(err); })
      .on('data', (chunk) => { body.push(chunk); })
      .on('end', () => { resolve(Buffer.concat(body).toString()); });
  });
}

function callBackendWith(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      console.log("Chamando o backend com o seguinte payload: '%s'", options.body);

      let result = [];

      res.on('data', (chunk) => { result.push(chunk); })
        .on('end', () => { resolve(Buffer.concat(result).toString().trim()); })
        .on('error', (err) => { reject(err); });
    });

    req.on('error', (e) => { reject(e.message); });
    req.write(options.body || '');
    req.end();
  });
}

async function getDetailsOf(stock, clearCache) {
  if(!clearCache) {
    let cachedValue = await checkCache(cache, stock);
    if(cachedValue) {
      return cachedValue;
    }
  } else {
    await deleteCache(cache, stock);
  }

  return updateCache(cache, stock, await callBackendWith({
    host: 'fundamentus.com.br',
    path: '/detalhes.php?papel=' + stock,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36',
      'Cookie': "PHPSESSID=9880b6d9d5575ed4a635737b1977fe87; __utma=138951332.1866296538.1534982752.1534982752.1534982752.1; __utmc=138951332; __utmz=138951332.1534982752.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __utmt=1; __utmb=138951332.9.10.1534982752"
    }
  }));
}

async function redirectToBackend(body, clearCache) {
  if(!clearCache) {
    let cachedValue = await checkCache(cache, body);
    if(cachedValue) {
      return cachedValue;
    }
  } else {
    await deleteCache(cache, body);
  }

  return updateCache(cache, body, await callBackendWith({
      host: 'fundamentus.com.br',
      path: '/resultado.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36',
      },
      body: body
    }));
}

const server = http.createServer(async (request, response) => {
  const { method, headers } = request;
  const query = url.parse(request.url, true).query;
  
  console.log('Verificando a presença da chave de API no cabeçalho...');
  if(headers['x-api-key'] !== API_KEY) { // XXX têm que ser em minúsculas!
    console.log('Chave de API não encontrada. Requisição rejeitada.');
    response.statusCode = 403;
    response.end();
    return;
  }

  let body = await bodyOf(request);

  if(method === 'POST') {
    console.log('Fazendo uma busca...');

    response.writeHead(200, { 'Content-Type': 'text/html; charset=latin1' });
    response.write(await redirectToBackend(body, query.clearCache));
    response.end();
  } else if(method === 'GET') {
    if(! query.papel) {
      response.statusCode = 400;
      response.write('Parâmetro "papel" ausente!');
      response.end();
    } else {
      console.log('Pegando detalhes de ' + query.papel + '...');
      
      response.writeHead(200, { 'Content-Type': 'text/html; charset=latin1' });
      response.write(await getDetailsOf(query.papel, query.clearCache));
      response.end();
    }
  } else {
    response.statusCode = 405;
    response.end();
  }

  console.log('Fim.');
});

server.listen(PORT);
