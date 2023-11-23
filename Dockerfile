# pull base image
FROM node:20-buster-slim

# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV

# default to port 3000 for node
ARG PORT=3000
ENV PORT $PORT
EXPOSE $PORT

# install global packages
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH /home/node/.npm-global/bin:$PATH
RUN npm i --unsafe-perm --allow-root -g npm@latest expo-cli@latest

# install dependencies first, in a different location for easier app bind mounting for local development
# due to default /opt permissions we have to create the dir with root and change perms
RUN mkdir /opt/gm
WORKDIR /opt/gm
ENV PATH /opt/gm/.bin:$PATH
COPY ../test5/package.json ../test5/package-lock.json ./
RUN npm install

# copy in our source code last, as it changes the most
WORKDIR /opt/gm/app
# for development, we bind mount volumes; comment out for production
COPY ../test5/App.js ../test5/app.json ../test5/screens ../test5/components ../test5/images ../test5/android ../test5/ios .

ENTRYPOINT ["npm", "run"]
CMD ["web"]

