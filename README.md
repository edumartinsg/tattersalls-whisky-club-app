# Whisky Club

Sistema de controle do whisky club, organizado por range de whiskeys (blocos
de 10, exemplo 1-10, 11-20) em vez de por ano. O app roda inteiramente no
navegador, hospedado de graca no GitHub Pages, e usa uma planilha Google
como banco de dados real, atraves de um backend gratuito (Google Apps
Script).

## Como o sistema funciona

O app e sempre quem manda. Toda tela fala com o backend, nunca direto com a
planilha. A planilha serve como espelho legivel e backup automatico, nao
como o lugar onde as regras de negocio vivem.

Cada socio pode ter uma ou mais "memberships", uma membership e a compra de
um range especifico (por exemplo, range 11-20), com sua propria data de
ativacao e forma de pagamento. Um mesmo socio pode ter comprado varios
ranges ao longo do tempo, cada um com seu proprio prazo de validade de 1
ano. Um whiskey ainda nao resgatado continua valendo mesmo depois do prazo
de 1 ano expirar, a expiracao so afeta coisas fora deste app (como o preco
cobrado no sistema do bar).

## Passo 1, criar a planilha e o backend

1. Crie uma Google Sheet nova e vazia, na conta Google do clube.
2. Va em Extensoes > Apps Script.
3. Apague o conteudo padrao do arquivo `Code.gs` e cole o conteudo de
   `apps-script/Code.gs` deste projeto.
4. No topo do arquivo, edite a linha `const NOTIFICATION_EMAIL = ''` e
   coloque entre aspas o email que deve receber o aviso de novo membro.
   Sem isso preenchido, o email simplesmente nao e enviado.
5. Rode a funcao `setupSheets` uma vez (cria as quatro abas usadas pelo
   backend, Members, RangeMemberships, Redemptions, WhiskeySlots).
6. Clique em Implantar > Nova implantacao, tipo Aplicativo da web,
   executar como Eu mesmo, acesso Qualquer pessoa. Copie a URL gerada,
   termina em `/exec`.

## Passo 2, importar o historico

O `seed.json` em `data-migration/` ja foi gerado a partir da planilha
antiga, mapeando cada temporada antiga (2021/2022 a 2025/2026) para o range
numerico correspondente, ja que cada temporada sempre vendeu exatamente um
bloco de 10 whiskeys.

Duas coisas pra saber antes de importar:

- Nomes que mudaram entre temporadas nao sao unidos automaticamente. Por
  exemplo "Airey, Alexis" nas temporadas antigas e "Airey, Lexi" na atual
  entraram como duas pessoas diferentes.
- A data de ativacao de cada membership historica foi definida como 1 de
  fevereiro do primeiro ano da temporada correspondente, ja que e uma data
  fictícia (o dado real nunca foi registrado no processo antigo).

Pra importar, no terminal, dentro de `data-migration`:

```
pip install openpyxl
python parse_legacy_excel.py Whisky_Club_2025-26.xlsx
python import_seed.py "URL_DO_APPS_SCRIPT" seed.json
```

## Passo 3, configurar o app

Abra `src/config.js` e troque `APPS_SCRIPT_WEB_APP_URL` pela URL do passo 1
e `APP_PIN` por um numero simples que a equipe do bar vai usar.

## Passo 4, testar localmente

Rode `npm install` e depois `npm run dev`, abra o endereco que aparecer no
terminal. Teste a busca de socio, adicionar um socio a um range, tickar e
destickar whiskeys, editar o nome de um whiskey.

## Passo 5, publicar no GitHub Pages

```
VITE_BASE_PATH=/nome-do-repositorio/ npm run build
npm run deploy
```

Depois ative o GitHub Pages nas configuracoes do repositorio, apontando
para a branch `gh-pages`.

## Atualizar nomes de whiskeys sem afetar sócios

Quando a lista de whiskeys mudar (troca de garrafa, lista corrigida), rode
o script abaixo, ele mexe só na aba WhiskeySlots, nunca em sócios,
memberships ou consumo:

```
python update_whiskey_names.py "URL_DO_APPS_SCRIPT" whiskey_names.json
```

O arquivo `whiskey_names.json` tem o formato `{"1": "Nome do whiskey", "2": "..."}`.
Edite esse arquivo com os nomes atualizados antes de rodar o script.

## Passo 6, acessar pelo iPad

Abra o link direto no Safari, nao dentro do Notion, e use "Adicionar a
Tela de Inicio". Um link normal dentro do Notion (que abre em nova aba) e
seguro, so o iframe embutido deve ser evitado.

## Estrutura das paginas

- Home, busca de socio, botao de adicionar socio, busca de whiskey.
- Members, lista de socios ativos (e inativos, opcional), remover e
  reativar.
- Whiskeys, catalogo completo dos 100 slots, agrupado por range, editavel.
- Ranges, uma aba por bloco de 10 (1-10, 11-20, ate 91-100), mostrando a
  tabela de socios daquele range com o checklist de 10 whiskeys, e o botao
  de bloquear membro.
- Add member, formulario de nome, codigo, range e forma de pagamento
  (member account ou cash/credit card). Se o codigo digitado ja existir,
  o sistema reconhece o socio e so adiciona o novo range a conta dele, em
  vez de criar um socio duplicado.

## O que o app nao faz

Nao integra com o sistema de POS do bar. O desconto de 100% no whiskey
gratis continua sendo aplicado manualmente pela equipe.

## Backup

Alem da planilha Google, que atualiza a cada acao, existe o botao
"Export backup to Excel" dentro do app, a qualquer momento.

## Estrutura do codigo

```
src/
  data/            Camada de acesso a dados, isolada da interface
  domain/          Regras de negocio puras (ranges, expiracao, bloqueio)
  context/         Estado compartilhado entre as telas
  components/      Interface
apps-script/       Backend que roda dentro da Google Sheet
data-migration/    Scripts usados uma unica vez para importar o historico
```
