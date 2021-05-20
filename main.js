const http = require('http');
const url = require('url');
const request = require('request');

//const cloudscraper = require('cloudflare-scraper');

const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 8080;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36';
const COOKIE = "__cfduid=d3ec342337c0f3436939392009a7b86781619091765; PHPSESSID=049a1a4e116f9b60d7d77aedc0f90dee; _fbp=fb.2.1619091804951.179535537; __gads=ID=bddb5163528c530d-2225597cd1b300f9:T=1619091766:RT=1619091766:S=ALNI_MZd9DUSgtOb8naC-dhXJ21lDClBTQ; __utmc=138951332; __utmz=138951332.1619091805.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); nv_int=1; privacidade=1; __utma=138951332.512805419.1619091805.1621376741.1621385224.6; __utmt=1; __utmb=138951332.5.10.1621385224";
const ENCODING = 'ISO-8859-1';

function bodyOf(req) {
  return new Promise((resolve, reject) => {
    let body = [];

    req.on('error', (err) => { reject(err); })
      .on('data', (chunk) => { body.push(chunk); })
      .on('end', () => { resolve(Buffer.concat(body).toString()); });
  });
}

function callBackendWith(options) {
  return new Promise((resolve, reject) => {
    request(options, (err, res, body) => {
      console.log("Chamando o backend com o seguinte payload: '%s'", options.body);

      if(err) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

async function getDetailsOf(stock) {
  //return await cloudscraper.get('http://fundamentus.com.br/detalhes.php?papel='+stock);

  return await callBackendWith({
    uri: 'http://fundamentus.com.br/detalhes.php?papel=' + stock,
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT
    },
    jar: request.jar(),
  });
}

async function redirectToBackend(body) {
  /*return await cloudscraper.post(
    {
      uri: 'http://fundamentus.com.br/resultado.php',
      formData: body,
    });*/

  return await callBackendWith({
    uri: 'http://fundamentus.com.br/resultado.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': body.length, // XXX sem isto aqui o POST não funfa!
      'User-Agent': USER_AGENT,
    },
    body: body,
    jar: request.jar(),
  });
}

const server = http.createServer(async (req, res) => {
  const { method, headers } = req;
  const query = url.parse(req.url, true).query;
  
  console.log('Verificando a presença da chave de API no cabeçalho...');
  if(headers['x-api-key'] !== API_KEY) { // XXX têm que ser em minúsculas!
    console.log('Chave de API não encontrada. Requisição rejeitada.');
    res.statusCode = 403;
    res.end();
    return;
  }

  let body = await bodyOf(req);

  if(method === 'POST') {
    console.log('Fazendo uma busca...');

    res.writeHead(200, { 'Content-Type': 'text/html; charset='+ENCODING });
    res.write(await redirectToBackend(body));
    res.end();
  } else if(method === 'GET') {
    if(! query.papel) {
      res.statusCode = 400;
      res.write('Parâmetro "papel" ausente!');
      res.end();
    } else {
      console.log('Pegando detalhes de ' + query.papel + '...');
      
      res.writeHead(200, { 'Content-Type': 'text/html; charset='+ENCODING });
      res.write(await getDetailsOf(query.papel));
      res.end();
    }
  } else {
    res.statusCode = 405;
    res.end();
  }

  console.log('Fim.');
});

server.listen(PORT);
