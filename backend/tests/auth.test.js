 jest.mock("../models/User.js", () =>({
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn()
 }))

const request = require("supertest");
const bcrypt =require("bcryptjs");
//const jwt = require("jsonwebtoken");
const User = require("../models/User");
const app = require("../app");
// const { findById, findByIdAndUpdate } = require("../models/User");
// const { refreshToken } = require("../controllers/authController");

describe("Authorization API", () => {

    beforeEach(()=>{
        jest.clearAllMocks();
    })

    test("Admin should login successfully", async()=>{

        const passwordHash = await bcrypt.hash("Logincode@10", 10);

        const mockUser = {
            _id: "admin-id-123",
            email: "admin@test.com",
            role: "admin",
            password: passwordHash,
            refreshToken: null,

            save: jest.fn().mockResolvedValue(true)
        }

        User.findOne.mockReturnValue({
            select:jest.fn().mockResolvedValue(mockUser)
        });

        const response = await request(app)
                        .post("/api/auth/login")
                        .send({
                            email:"admin@test.com",
                            password:"Logincode@10"
                        });

        expect(response.statusCode).toBe(200);

        expect(response.body.success).toBe(true);

        expect(response.body).toHaveProperty("accessToken");

        expect(response.body).toHaveProperty("refreshToken");

       expect(response.body.user.email).toBe("admin@test.com");

       expect(response.body.user.role).toBe("admin");

       expect(mockUser.save).toHaveBeenCalledTimes(1);

       expect(User.findOne).toHaveBeenCalledWith({
        email: "admin@test.com"
       })


    })

    test("User should login successfully", async()=>{
        
        const passwordHash = await bcrypt.hash("Logincode@10", 10);

        const mockUser = {
            _id: "user-id-123",
            email: "user@test.com",
            role: "user",
            password: passwordHash,
            refreshToken: null,

            save: jest.fn().mockResolvedValue(true)
        };

        User.findOne.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        })

        const response = await request(app)
                                .post("/api/auth/login")
                                .send({
                                    email: "user@test.com",
                                    password:"Logincode@10"
                                })
        
        expect(response.statusCode).toBe(200);

        expect(response.body.success).toBe(true);

        expect(response.body).toHaveProperty("accessToken");

        expect(response.body).toHaveProperty("refreshToken");

        expect(response.body.user.email).toBe("user@test.com");

       expect(response.body.user.role).toBe("user");

       expect(mockUser.save).toHaveBeenCalledTimes(1);

    //    expect(User.findOne).toHaveBeenCalledWith({
    //     email: "user@test.com"
    //    })                                

    })

    test("Invalid credentails should return 401", async()=>{

        const mockUser = {
            _id: "user-id-123",
            email: "user@test.com",
            role: "user",
            password: "some-password",
            refreshToken: null,

        };
        
        User.findOne.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        })

        jest.spyOn(bcrypt, "compare").mockResolvedValue(false);

        const response = await request(app)
                                .post("/api/auth/login")
                                .send({
                                    email: "wrong@test.com",
                                    password: "wrong-password"
                                })

        expect(response.statusCode).toBe(401);

        expect(response.body.success).toBe(false);

        expect(response.body.message).toBe("Invalid Credentials");
    })
})
