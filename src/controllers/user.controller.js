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
    const currentUserId = req.user.userId;
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    const allUsers = await db.orm.public.User.all();
    const myMemberships = await db.orm.public.ConversationMember.where({
      userId: currentUserId,
    }).all();
    const allMemberships = await db.orm.public.ConversationMember.all();

    const search = q.trim().toLowerCase();

    const matchedUsers = allUsers
      .filter(
        (user) =>
          user.id !== currentUserId &&
          (user.name?.toLowerCase().includes(search) ||
            user.email?.toLowerCase().includes(search))
      )
      .slice(0, 20);

    const formattedUsers = matchedUsers.map((user) => {
      let activeConvId = null;
      let hasActiveConversation = false;

      for (const myM of myMemberships) {
        if (Boolean(myM.isDeleted)) continue;

        const otherM = allMemberships.find(
          (m) => m.conversationId === myM.conversationId && m.userId === user.id
        );

        if (otherM) {
          activeConvId = myM.conversationId;
          hasActiveConversation = true;
          break;
        }
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isOnline: Boolean(user.isOnline),
        lastSeen: user.lastSeen,
        hasActiveConversation,
        conversationId: activeConvId,
      };
    });

    return res.status(200).json({
      success: true,
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Search users error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user.userId;
    const targetUserId = Number(req.params.userId);

    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (blockerId === targetUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself",
      });
    }

    const targetUser = await db.orm.public.User.first({
      id: targetUserId,
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingBlock = await db.orm.public.UserBlock.first({
      blockerId,
      blockedId: targetUserId,
    });

    if (existingBlock) {
      return res.status(200).json({
        success: true,
        message: "User already blocked",
      });
    }

    await db.orm.public.UserBlock.create({
      blockerId,
      blockedId: targetUserId,
    });

    return res.status(200).json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    console.error("Block user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const blockerId = req.user.userId;
    const targetUserId = Number(req.params.userId);

    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const existingBlock = await db.orm.public.UserBlock.first({
      blockerId,
      blockedId: targetUserId,
    });

    if (existingBlock) {
      await db.orm.public.UserBlock.where({
        id: existingBlock.id,
      }).delete();
    }

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    console.error("Unblock user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getBlockStatus = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = Number(req.params.userId);

    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const block1 = await db.orm.public.UserBlock.first({
      blockerId: currentUserId,
      blockedId: targetUserId,
    });

    const block2 = await db.orm.public.UserBlock.first({
      blockerId: targetUserId,
      blockedId: currentUserId,
    });

    const blockedByUser = Boolean(block1);
    const userBlockedMe = Boolean(block2);
    const isBlocked = blockedByUser || userBlockedMe;

    return res.status(200).json({
      success: true,
      isBlocked,
      blockedByUser,
      userBlockedMe,
    });
  } catch (error) {
    console.error("Get block status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getBlockedUsers = async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    const blocks = await db.orm.public.UserBlock.where({
      blockerId: currentUserId,
    }).all();

    const blockedIds = new Set(blocks.map((b) => Number(b.blockedId)));
    const allUsers = await db.orm.public.User.all();

    const users = allUsers
      .filter((u) => blockedIds.has(Number(u.id)))
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        isOnline: Boolean(u.isOnline),
        lastSeen: u.lastSeen,
        createdAt: u.createdAt,
      }));

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Get blocked users error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};