FROM node:18

WORKDIR /app

# Install Python and system libraries for OpenCV/TensorFlow.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		python3 \
		python3-pip \
		python-is-python3 \
		python3-venv \
		libgl1 \
		libglib2.0-0 \
		libsm6 \
		libxrender1 \
		libxext6 \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

# Create a virtual environment to avoid PEP 668 restrictions.
RUN python3 -m venv /opt/venv

# Use the venv for all Python installs and runtime.
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./requirements.txt

# Install Python dependencies inside the venv.
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]