import { db } from "../prisma/db.js";

export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

 const user = await db.orm.public.User.first({
  id: userId,
});

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    let { name, avatar } = req.body;
    let newAvatar = undefined;

    // Check if an avatar file was uploaded via uploadSingleAvatar middleware
    if (req.file) {
      newAvatar = `/uploads/${req.file.filename}`;
    } else if (avatar !== undefined) {
      if (avatar !== null && typeof avatar !== "string") {
        return res.status(400).json({
          success: false,
          message: "Avatar must be a string or null",
        });
      }
      newAvatar = avatar;
    }

    // Name validation if provided
    let trimmedName = undefined;
    if (name !== undefined) {
      if (typeof name !== "string") {
        return res.status(400).json({
          success: false,
          message: "Name must be a string",
        });
      }
      trimmedName = name.trim();
      if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 50) {
        return res.status(400).json({
          success: false,
          message: "Name must be between 2 and 50 characters",
        });
      }
    }

    if (trimmedName === undefined && newAvatar === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name or avatar file is required to update profile",
      });
    }

    const updateData = {};
    if (trimmedName !== undefined) {
      updateData.name = trimmedName;
    }
    if (newAvatar !== undefined) {
      updateData.avatar = newAvatar;
    }

    const updatedUser = await db.orm.public.User
      .where({
        id: userId,
      })
      .update(updateData);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    const users = await db.orm.public.User.all();

    const search = q.trim().toLowerCase();

    const filteredUsers = users
      .filter((user) => {
        return (
          user.name?.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search)
        );
      })
      .slice(0, 20)
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      }));

    return res.status(200).json({
      success: true,
      users: filteredUsers,
    });
  } catch (error) {
    console.error("Search users error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};