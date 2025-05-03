import url from 'url';

export function parseUrl(input) {
  if (!input.match(/^[a-zA-Z]+:\/\//)) {
    input = 'http://' + input;
  }

  const parsed = url.parse(input);

  const response = {}

  response.protocol = parsed.protocol ? parsed.protocol.replace(':', '') : 'http';
  response.host = parsed.hostname;
  response.port = parsed.port || ( response.protocol == 'https' ? '443' : '80' );

  return response;
}