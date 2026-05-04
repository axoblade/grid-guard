import axios from 'axios';
import { Location } from '../types';

const normalizePhone = (phone: string) => phone.startsWith('+') ? phone : `+${phone}`;

export const nokiaService = {
  async getSimLocation(phoneNumber: string): Promise<{ latitude: number; longitude: number; radius: number; lastLocationTime: string }> {
    const formattedPhone = normalizePhone(phoneNumber);
    const response = await axios.post('/api/nokia/location', { phoneNumber: formattedPhone });
    const { area, lastLocationTime } = response.data;
    return {
      latitude: area.center.latitude,
      longitude: area.center.longitude,
      radius: area.radius,
      lastLocationTime,
    };
  },

  async verifyLocation(phoneNumber: string, center: Location, radius: number): Promise<{ verificationResult: boolean; lastLocationTime: string }> {
    const formattedPhone = normalizePhone(phoneNumber);
    const response = await axios.post('/api/nokia/verify-location', { phoneNumber: formattedPhone, center, radius });
    return {
      verificationResult: response.data.verificationResult === 'TRUE',
      lastLocationTime: response.data.lastLocationTime,
    };
  },

  async checkSimSwap(phoneNumber: string, maxAge: number = 240): Promise<{ swapped: boolean }> {
    const formattedPhone = normalizePhone(phoneNumber);
    const response = await axios.post('/api/nokia/sim-swap', { phoneNumber: formattedPhone, maxAge });
    return {
      swapped: response.data.swapped === true || response.data.swapped === 'true',
    };
  },

  async subscribeToGeofencing(phoneNumber: string, center: Location, radius: number): Promise<any> {
    const formattedPhone = normalizePhone(phoneNumber);
    // Sink points to our webhook receiver
    const sink = `${window.location.origin}/api/nokia/webhook`;
    const response = await axios.post('/api/nokia/geofencing/subscribe', { 
      phoneNumber: formattedPhone, 
      center, 
      radius,
      sink 
    });
    return response.data;
  }
};

