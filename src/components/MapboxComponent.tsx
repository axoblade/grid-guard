import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Transformer } from '../types';

interface MapboxComponentProps {
  transformers: Transformer[];
  onSelectTransformer: (transformer: Transformer) => void;
  selectedTransformerId?: string;
}

const MapboxComponent: React.FC<MapboxComponentProps> = ({ 
  transformers, 
  onSelectTransformer,
  selectedTransformerId 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const [tokenMissing] = useState(() => {
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    return !token || token === 'YOUR_MAPBOX_TOKEN';
  });

  useEffect(() => {
    if (tokenMissing) return;
    if (map.current) return;
    
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) return;
    mapboxgl.accessToken = token;
    
    if (!mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-122.4194, 37.7749], // Default center
      zoom: 9
    });

    mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    mapInstance.on('click', (e) => {
      // If we clicked the map itself (not a marker)
      if (e.originalEvent.target === mapInstance.getCanvas()) {
        onSelectTransformer(null as any); // Use null to deselect
      }
    });

    map.current = mapInstance;

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, [tokenMissing]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;

    // Clear existing markers
    Object.values(markers.current).forEach((marker: mapboxgl.Marker) => marker.remove());
    markers.current = {};

    transformers.forEach(t => {
      if (!t.currentLocation) return;
      
      // Container for marker and label
      const container = document.createElement('div');
      container.className = 'flex flex-col items-center group';

      // The dot marker
      const markerEl = document.createElement('div');
      markerEl.className = `w-6 h-6 rounded-full border-2 border-zinc-950 shadow-lg cursor-pointer transition-all duration-300 hover:scale-125 ${
        t.status === 'GREEN' ? 'bg-emerald-500' : 
        t.status === 'ORANGE' ? 'bg-amber-500' : 
        t.status === 'RED' ? 'bg-rose-500 animate-pulse alert-pulse-rose' : 'bg-zinc-500'
      } ${selectedTransformerId === t.id ? 'ring-4 ring-white scale-125 z-50' : ''}`;
      
      // The name label
      const labelEl = document.createElement('div');
      labelEl.className = `mt-1 px-2 py-0.5 rounded bg-zinc-950/90 border border-zinc-800 text-[10px] font-bold text-zinc-100 whitespace-nowrap shadow-xl pointer-events-none transition-opacity duration-300 ${
        selectedTransformerId === t.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`;
      labelEl.textContent = t.name;

      container.appendChild(markerEl);
      container.appendChild(labelEl);
      
      const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        onSelectTransformer(t);
      };

      container.addEventListener('click', handleClick);

      try {
        const marker = new mapboxgl.Marker({ element: container })
          .setLngLat([t.currentLocation.longitude, t.currentLocation.latitude])
          .addTo(currentMap);

        markers.current[t.id] = marker;
      } catch (err) {
        console.error("Failed to add marker for", t.name, err);
      }
    });

    if (transformers.length > 0 && !selectedTransformerId) {
      try {
        const bounds = new mapboxgl.LngLatBounds();
        transformers.forEach(t => {
          if (t.currentLocation) {
            bounds.extend([t.currentLocation.longitude, t.currentLocation.latitude]);
          }
        });
        if (!bounds.isEmpty()) {
          currentMap.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        }
      } catch (err) {
        console.error("Failed to fit bounds", err);
      }
    }
  }, [transformers, selectedTransformerId]);

  useEffect(() => {
    if (!map.current || !selectedTransformerId) return;

    const selected = transformers.find(t => t.id === selectedTransformerId);
    if (selected) {
      map.current.flyTo({
        center: [selected.currentLocation.longitude, selected.currentLocation.latitude],
        zoom: 16,
        essential: true
      });
    }
  }, [selectedTransformerId]);

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden border border-[#2c2e33]">
      {tokenMissing ? (
        <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center p-8 text-center dot-grid z-20">
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mb-4 border border-rose-500/20">
            <span className="font-black text-2xl">!</span>
          </div>
          <h3 className="text-lg font-bold text-zinc-100 mb-2">Mapbox Token Required</h3>
          <p className="text-sm text-zinc-500 max-w-sm mb-6">
            To view the interactive grid map, please add your Mapbox Access Token to the environment variables.
          </p>
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-left w-full max-w-sm">
            <p className="text-[10px] text-zinc-600 font-bold uppercase mb-2 tracking-widest">Setup Instructions</p>
            <ol className="text-[11px] text-zinc-400 space-y-1 ml-4 list-decimal">
              <li>Get a token from mapbox.com</li>
              <li>Open Settings &gt; Secrets</li>
              <li>Add <code>VITE_MAPBOX_ACCESS_TOKEN</code></li>
              <li>Refresh the application</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          <div ref={mapContainer} className="w-full h-full" />
          <div className="absolute top-4 left-4 bg-zinc-950/80 backdrop-blur-md p-3 rounded-2xl border border-zinc-800 z-10 shadow-2xl">
            <h3 className="text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-widest">Network Status</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] text-zinc-300">Operational</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span className="text-[10px] text-zinc-300">Drift</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500 pulse-rose"></div>
                <span className="text-[10px] text-zinc-300">Breach</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MapboxComponent;
