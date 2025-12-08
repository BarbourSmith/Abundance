/**
 * MaslowUploader - Handles uploading G-code files to Maslow CNC machines
 * 
 * This class provides methods to upload G-code files to Maslow machines via HTTP.
 * The Maslow firmware (FluidNC) accepts POST requests to upload files to either
 * SD card storage or local flash storage.
 */
class MaslowUploader {
    constructor(maslowIP) {
        this.maslowIP = maslowIP;
        this.baseURL = `http://${maslowIP}`;
    }
    
    /**
     * Upload a G-code file to the Maslow's SD card
     * @param {Blob|File} file - The file to upload
     * @param {string} filename - Desired filename on the Maslow
     * @param {Function} onProgress - Optional progress callback (receives percent 0-100)
     * @returns {Promise<Object>} Upload result
     */
    async uploadToSD(file, filename, onProgress = null) {
        return this._upload('/upload', file, filename, onProgress);
    }
    
    /**
     * Upload a file to the Maslow's local filesystem
     * @param {Blob|File} file - The file to upload
     * @param {string} filename - Desired filename on the Maslow
     * @param {Function} onProgress - Optional progress callback (receives percent 0-100)
     * @returns {Promise<Object>} Upload result
     */
    async uploadToLocalFS(file, filename, onProgress = null) {
        return this._upload('/files', file, filename, onProgress);
    }
    
    _upload(endpoint, file, filename, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            
            // Add the file and size parameter
            formData.append(filename, file, filename);
            formData.append(`${filename}S`, file.size.toString());
            
            // Setup progress tracking
            if (onProgress && typeof onProgress === 'function') {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                });
            }
            
            // Handle completion
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (result.status && result.status.includes('failed')) {
                            reject(new Error(result.status));
                        } else {
                            resolve(result);
                        }
                    } catch (e) {
                        reject(new Error('Invalid response from Maslow'));
                    }
                } else if (xhr.status === 401) {
                    reject(new Error('Authentication required. Please log in to the Maslow web interface first.'));
                } else {
                    reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            });
            
            // Handle errors
            xhr.addEventListener('error', () => {
                reject(new Error('Network error. Please check:\n- The Maslow is powered on and connected\n- The IP address is correct\n- Your firewall allows connections\n- You are on the same network'));
            });
            
            xhr.addEventListener('abort', () => {
                reject(new Error('Upload cancelled'));
            });
            
            // Send the request
            xhr.open('POST', `${this.baseURL}${endpoint}`);
            xhr.withCredentials = true; // Important for authentication
            xhr.send(formData);
        });
    }
    
    /**
     * Test if the Maslow is reachable
     * @returns {Promise<boolean>}
     */
    async isReachable() {
        try {
            // Try HEAD request first (lightweight check)
            const response = await fetch(`${this.baseURL}/`, {
                method: 'HEAD',
                credentials: 'include',
            });
            return response.ok;
        } catch (e) {
            // Fallback: Try GET request if HEAD is not supported
            try {
                const response = await fetch(`${this.baseURL}/`, {
                    method: 'GET',
                    credentials: 'include',
                });
                return response.ok;
            } catch (fallbackError) {
                return false;
            }
        }
    }
}

export default MaslowUploader;
