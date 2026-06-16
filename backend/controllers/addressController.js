const Address = require("../models/addressModel");

const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user.id });
    res.status(200).json({ status: "success", data: addresses });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const createAddress = async (req, res) => {
  try {
    const address = await Address.create({ user: req.user.id, ...req.body });
    if (address.isDefault) {
      await Address.updateMany({ user: req.user.id, _id: { $ne: address._id } }, { isDefault: false });
    }
    res.status(201).json({ status: "success", data: address });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const updateAddress = async (req, res) => {
  try {
    const address = await Address.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true }
    );
    if (!address) {
      return res.status(404).json({ status: "fail", message: "Address not found" });
    }
    if (address.isDefault) {
      await Address.updateMany({ user: req.user.id, _id: { $ne: address._id } }, { isDefault: false });
    }
    res.status(200).json({ status: "success", data: address });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!address) {
      return res.status(404).json({ status: "fail", message: "Address not found" });
    }
    res.status(200).json({ status: "success", data: address });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
};