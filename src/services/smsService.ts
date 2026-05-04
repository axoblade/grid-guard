import axios from 'axios';

export const smsService = {
  async sendAlert(phone: string, msg: string) {
    try {
      const response = await axios.post('/api/sms/send', { phone, msg });
      return response.data;
    } catch (error) {
      console.error('SMS Service Error:', error);
      throw error;
    }
  }
};
