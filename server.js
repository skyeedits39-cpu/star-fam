socket.on('chat:send', async (data) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanSenderLower = user.username.toLowerCase();
    const targetRoom = data.targetRoom.toLowerCase();

    const payload = {
      id: 'msg-' + Date.now() + '-' + Math.round(Math.random()*1000),
      sender: user.username, tag: user.tag, role: user.role, pfp: user.pfp,
      targetRoom: targetRoom, text: data.text || '', mediaUrl: data.mediaUrl || null, mediaType: data.mediaType || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const chatCol = db.collection('chatHistory');

    if (targetRoom === 'global' || targetRoom === 'editing-comp') {
      await chatCol.updateOne({ room: targetRoom }, { $push: { messages: payload } }, { upsert: true });
      io.emit('chat:message', { ...payload, room: targetRoom });
    } else if (targetRoom.startsWith('dm-')) {
      const recipientLower = targetRoom.replace('dm-', '');
      const threadKey = [cleanSenderLower, recipientLower].sort().join('_');
      const dmsCol = db.collection('privateDMs');
      await dmsCol.updateOne({ threadKey }, { $push: { messages: payload } }, { upsert: true });
      
      io.sockets.sockets.forEach(s => {
        const client = activeSockets[s.id];
        if (client && (client.username.toLowerCase() === cleanSenderLower || client.username.toLowerCase() === recipientLower)) {
          s.emit('chat:message', { ...payload, room: targetRoom, targetRoom: targetRoom });
        }
      });
    }
  });

  socket.on('chat:delete', async ({ msgId, room }) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const isOwnerUser = user.isOwner || user.username.toLowerCase() === OWNER_USERNAME;
    const cleanRoom = room.toLowerCase();

    const chatCol = db.collection('chatHistory');
    const dmsCol = db.collection('privateDMs');

    if (cleanRoom === 'global' || cleanRoom === 'editing-comp') {
      const chatDoc = await chatCol.findOne({ room: cleanRoom });
      if (chatDoc && chatDoc.messages) {
        const msg = chatDoc.messages.find(m => m.id === msgId);
        if (msg && (msg.sender.toLowerCase() === user.username.toLowerCase() || isOwnerUser)) {
          await chatCol.updateOne({ room: cleanRoom }, { $pull: { messages: { id: msgId } } });
          io.emit('chat:refresh', { room: cleanRoom });
        }
      }
    } else {
      const dmsDocs = await dmsCol.find({}).toArray();
      for (let doc of dmsDocs) {
        if (doc.messages) {
          const msg = doc.messages.find(m => m.id === msgId);
          if (msg && (msg.sender.toLowerCase() === user.username.toLowerCase() || isOwnerUser)) {
            await dmsCol.updateOne({ threadKey: doc.threadKey }, { $pull: { messages: { id: msgId } } });
            io.emit('chat:refresh', cleanRoom);
          }
        }
      }
    }
  });