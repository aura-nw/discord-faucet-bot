FROM node:16

ARG PORT=8000

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY . .
RUN npm install && npm cache clean --force
# RUN npm run build

EXPOSE $PORT

CMD [ "npm", "run", "start" ]