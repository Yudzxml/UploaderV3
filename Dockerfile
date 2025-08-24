# Gunakan image Node.js resmi
FROM node:22

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh isi project ke container
COPY . .

# Jalankan server.js saat container dimulai
CMD ["node", "server.js"]

# Expose port yang digunakan server (default 3000)
EXPOSE 3000
