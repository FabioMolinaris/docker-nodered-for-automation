FROM nodered/node-red

# Create app directory
WORKDIR /usr/src/node-red/

# Copy dependecies json 
COPY package.json .
COPY custom_nodes/ .

# Install dependencies which are not mentioned in the json file
# RUN npm install node-red-contrib-schneider-powertag 

# Install json dependencies
USER 0:0
RUN npm install --unsafe-perm --no-update-notifier --no-fund 
#RUN npm audit fix --force
RUN npm update
RUN npm install -g npm

# Start application
CMD [ "npm", "start", "--", "--userDir", "/data" ]