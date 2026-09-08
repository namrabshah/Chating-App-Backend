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

    const { name, avatar } = req.body;

    // At least one field required
    if (name === undefined && avatar === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name or avatar is required",
      });
    }

    // Validate name
    if (name !== undefined && typeof name !== "string") {
      return res.status(400).json({
        success: false,
        message: "Name must be a string",
      });
    }

    // Validate avatar
    if (avatar !== undefined && avatar !== null && typeof avatar !== "string") {
      return res.status(400).json({
        success: false,
        message: "Avatar must be a string or null",
      });
    }

    const updateData = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (avatar !== undefined) {
      updateData.avatar = avatar;
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