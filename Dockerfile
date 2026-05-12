FROM node:20

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		python3 \
		python3-pip \
		python-is-python3 \
		libgl1 \
		libglib2.0-0 \
		libsm6 \
		libxrender1 \
		libxext6 \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY requirements.txt ./requirements.txt

RUN python3 -m pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]