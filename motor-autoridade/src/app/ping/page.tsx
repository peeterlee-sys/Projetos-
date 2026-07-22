export default function Ping() {
  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>
      <h1>✅ App está VIVO!</h1>
      <p>Se você vê isso, o problema é na middleware ou nas rotas autenticadas.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  );
}
