
import { io } from "socket.io-client";

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjcsImVtYWlsIjoidXNlcjJAZ21haWwuY29tIiwiaWF0IjoxNzg4NzY1NjY4LCJleHAiOjE3ODkzNzA0Njh9.mrGsD_QgBT9tQXoLikJ5Zq8FtjYay-ZvYG0RuiRZqF4";

const socket = io(
    "http://localhost:5000",
    {
        auth: {
            token,
        },
    }
);

// ========================================
// CONNECT
// ========================================
socket.on("connect", () => {
    console.log(
        "Connected:",
        socket.id
    );

    console.log(
        "JOINING CONVERSATION 3"
    );

  socket.emit(
    "join_conversation",
    3,
    (response) => {
        console.log(
            "JOIN ACK:",
            response
        );
    }
);

    // -----------------------------
    // Typing Test
    // -----------------------------

    setTimeout(() => {
        console.log(
            "Sending typing..."
        );

        socket.emit(
            "typing",
            3
        );
    }, 1000);

    // Stop typing after 4 seconds
    setTimeout(() => {
        console.log(
            "Sending stop typing..."
        );

        socket.emit(
            "stop_typing",
            3
        );
    }, 4000);
});

// ========================================
// CONNECTION ERROR
// ========================================

socket.on(
    "connect_error",
    (error) => {
        console.log(
            "Socket authentication error:",
            error.message
        );
    }
);

// ========================================
// ONLINE
// ========================================

socket.on(
    "user_online",
    (data) => {
        console.log(
            "USER ONLINE:",
            data
        );
    }
);

// ========================================
// OFFLINE
// ========================================

socket.on(
    "user_offline",
    (data) => {
        console.log(
            "USER OFFLINE:",
            data
        );
    }
);
// ========================================
// NEW MESSAGE
// ========================================

socket.on(
    "new_message",
    (data) => {
        console.log(
            "NEW MESSAGE RECEIVED:",
            data
        );

        // Tell server that message reached us
        socket.emit(
            "message_delivered",
            data.id
        );
    }
);

// ========================================
// MESSAGE DELIVERED
// ========================================

socket.on(
    "message_delivery_updated",
    (data) => {
        console.log(
            "MESSAGE DELIVERED:",
            data
        );
    }
);

// ========================================
// MESSAGE READ
// ========================================

socket.on(
    "message_read",
    (data) => {
        console.log(
            "MESSAGE READ RECEIVED:",
            data
        );
    }
);

// ========================================
// USER TYPING
// ========================================

socket.on(
    "user_typing",
    (data) => {
        console.log(
            "USER TYPING:",
            data
        );
    }
);

// ========================================
// USER STOP TYPING
// ========================================

socket.on(
    "user_stop_typing",
    (data) => {
        console.log(
            "USER STOP TYPING:",
            data
        );
    }
);